const { sql, getPool } = require("../config/db");
const {
  montarDateTimePlantao,
  dataFimPlantao,
  chaveData,
  formatarPeriodoPlantao,
  formatarHoraInput,
  formatarDataInput
} = require("../utils/horario");
const { statusConclusao, limparNomeFilial, resolverNomeEspecialidade } = require("../utils/statusPlantao");
const { sqlFiltroCrmEscalado, parseCrmLista } = require("../utils/crm");

const TOLERANCIA_MIN = 15;

const SELECT_PLANTAO_ENRIQUECIDO = `
  SELECT
    e.*,
    f.NOMEFANTASIA AS FILIAL_NOME_RAW,
    c.NOME AS SETOR_NOME,
    t.DESCRICAO AS TIPO_DESCRICAO,
    t.ESPECIALIDADE AS ESPECIALIDADE_TIPO,
    (
      SELECT COUNT(*) FROM REGISTROACESSO r WHERE r.IDPLANTAO = e.IDPLANTAO
    ) AS QTD_REGISTROS,
    (
      SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j WHERE j.IDPLANTAO = e.IDPLANTAO
    ) AS QTD_JUSTIFICATIVAS,
    (
      SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j
      WHERE j.IDPLANTAO = e.IDPLANTAO AND j.STATUSAPROVACAO = 'APROVADO'
    ) AS QTD_JUST_APROVADAS
  FROM ESCALAMEDICA e
  LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
  LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
  LEFT JOIN ZMDTIPOPLANTAOMEDICO2 t ON t.ID = e.CODTIPOPLANTAO
`;

function normalizarPlantao(row) {
  if (!row) return row;
  const crmLista = parseCrmLista(row.CRM_ESCALADO);
  const especialidadeCodigo = row.ESPECIALIDADE_TIPO != null && String(row.ESPECIALIDADE_TIPO).trim() !== ""
    ? String(row.ESPECIALIDADE_TIPO).trim()
    : (row.IDESPECIALIDADE != null ? String(row.IDESPECIALIDADE) : "");
  return {
    ...row,
    DATA_INPUT: formatarDataInput(row.DATA),
    HORAINICIO_INPUT: formatarHoraInput(row.HORAINICIO),
    HORAFIM_INPUT: formatarHoraInput(row.HORAFIM),
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    DATA_CHAVE: chaveData(row.DATA),
    FILIAL_NOME: limparNomeFilial(row.FILIAL_NOME_RAW) || String(row.CODFILIAL),
    SETOR_NOME: row.SETOR_NOME || row.CODCCUSTO,
    ESPECIALIDADE_CODIGO: especialidadeCodigo,
    ESPECIALIDADE_NOME: resolverNomeEspecialidade(especialidadeCodigo, row.TIPO_DESCRICAO),
    TIPO_NOME: row.TIPO_DESCRICAO || (row.CODTIPOPLANTAO != null ? `Tipo #${row.CODTIPOPLANTAO}` : ""),
    CRM_LISTA: crmLista,
    CONCLUSAO: statusConclusao(row)
  };
}

async function plantoesDoDia(crm, dataRef = null) {
  const pool = await getPool();
  const request = pool.request().input("crm", sql.VarChar, crm);
  let filtroData = "AND CAST(e.DATA AS DATE) = CAST(GETDATE() AS DATE)";

  if (dataRef) {
    request.input("dataRef", sql.Date, dataRef);
    filtroData = "AND CAST(e.DATA AS DATE) = @dataRef";
  }

  const result = await request.query(`
    ${SELECT_PLANTAO_ENRIQUECIDO}
    WHERE ${sqlFiltroCrmEscalado("e")}
      ${filtroData}
      AND e.STATUS IN ('ABERTO', 'EM_ANDAMENTO', 'PENDENTE_JUSTIFICATIVA')
    ORDER BY e.HORAINICIO ASC
  `);
  return result.recordset.map(normalizarPlantao);
}

async function todosPlantoes(crm) {
  const pool = await getPool();
  const result = await pool.request()
    .input("crm", sql.VarChar, crm)
    .query(`
      ${SELECT_PLANTAO_ENRIQUECIDO}
      WHERE ${sqlFiltroCrmEscalado("e")}
      ORDER BY e.DATA DESC, e.HORAINICIO DESC
    `);
  return result.recordset.map(normalizarPlantao);
}

async function registrosDoPlantao(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT * FROM REGISTROACESSO WHERE IDPLANTAO = @id ORDER BY RECCREATEDON ASC");
  return result.recordset.map(r => ({
    ...r,
    HORABATIDA_FMT: formatarHoraInput(r.HORABATIDA) || String(r.HORABATIDA || "")
  }));
}

function avaliarJanela(plantao, registros, crm = null) {
  const registrosDoMedico = crm
    ? (registros || []).filter(r => String(r.CRM || "").toUpperCase() === String(crm).toUpperCase())
    : (registros || []);
  const proximoTipo = registrosDoMedico.length === 0 ? "ENTRADA" : "SAIDA";
  const horaReferencia = proximoTipo === "ENTRADA" ? plantao.HORAINICIO : plantao.HORAFIM;

  let alvo;
  if (proximoTipo === "ENTRADA") {
    alvo = montarDateTimePlantao(plantao.DATA, horaReferencia);
  } else {
    const dataFim = dataFimPlantao(plantao.DATA, plantao.HORAINICIO, plantao.HORAFIM);
    alvo = montarDateTimePlantao(dataFim, horaReferencia);
  }

  const agora = new Date();
  if (!alvo) {
    return {
      proximoTipo,
      dentroDaJanela: false,
      antesDaJanela: true,
      depoisDaJanela: false,
      podeJustificar: false,
      podeIniciar: false,
      diffMin: null
    };
  }

  const diffMs = agora.getTime() - alvo.getTime();
  const diffMinAbs = Math.abs(diffMs) / 60000;
  const dentroDaJanela = diffMinAbs <= TOLERANCIA_MIN;
  const antesDaJanela = diffMs < 0 && !dentroDaJanela;
  const depoisDaJanela = diffMs > 0 && !dentroDaJanela;
  const podeJustificar = depoisDaJanela;
  const jaConcluiu = registrosDoMedico.some(r => r.TIPO === "SAIDA");
  const podeIniciar = dentroDaJanela
    && !jaConcluiu
    && plantao.STATUS !== "CANCELADO";

  return {
    proximoTipo: jaConcluiu ? "SAIDA" : proximoTipo,
    dentroDaJanela,
    antesDaJanela,
    depoisDaJanela,
    podeJustificar: podeJustificar && !jaConcluiu,
    podeIniciar,
    concluidoParaMedico: jaConcluiu,
    diffMin: Math.round(diffMinAbs)
  };
}

async function registrarBatida(idPlantao, crm, tipo) {
  const pool = await getPool();
  const agora = new Date();
  const dataBatida = agora.toISOString().slice(0, 10);
  const horaBatida = agora.toTimeString().slice(0, 8);

  await pool.request()
    .input("idPlantao", sql.Int, idPlantao)
    .input("tipo", sql.VarChar, tipo)
    .input("dataBatida", sql.Date, dataBatida)
    .input("horaBatida", sql.VarChar, horaBatida)
    .input("crm", sql.VarChar, crm)
    .query(`
      INSERT INTO REGISTROACESSO (IDPLANTAO, TIPO, DATABATIDA, HORABATIDA, CRM)
      VALUES (@idPlantao, @tipo, @dataBatida, @horaBatida, @crm)
    `);

  const plantao = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT CRM_ESCALADO, STATUS FROM ESCALAMEDICA WHERE IDPLANTAO = @id");
  const row = plantao.recordset[0];
  if (!row || row.STATUS === "CANCELADO") return;

  const registros = await registrosDoPlantao(idPlantao);
  const crms = parseCrmLista(row.CRM_ESCALADO);
  const todosComSaida = crms.length > 0 && crms.every(c =>
    registros.some(r => String(r.CRM || "").toUpperCase() === c.toUpperCase() && r.TIPO === "SAIDA")
  );
  const algumComEntrada = crms.some(c =>
    registros.some(r => String(r.CRM || "").toUpperCase() === c.toUpperCase() && r.TIPO === "ENTRADA")
  );

  let novoStatus = row.STATUS;
  if (todosComSaida) novoStatus = "CONCLUIDO";
  else if (algumComEntrada || tipo === "ENTRADA") novoStatus = "EM_ANDAMENTO";

  if (novoStatus !== row.STATUS) {
    await pool.request()
      .input("id", sql.Int, idPlantao)
      .input("status", sql.VarChar, novoStatus)
      .query("UPDATE ESCALAMEDICA SET STATUS = @status WHERE IDPLANTAO = @id");
  }
}

module.exports = {
  plantoesDoDia,
  todosPlantoes,
  registrosDoPlantao,
  avaliarJanela,
  registrarBatida,
  TOLERANCIA_MIN,
  normalizarPlantao
};
