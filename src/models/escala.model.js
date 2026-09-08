const { sql, getPool } = require("../config/db");
const {
  extrairHoraMinuto,
  formatarPeriodoPlantao,
  formatarHoraInput,
  formatarDataInput,
  formatarHoraCurta,
  formatarDataPt,
  horariosSobrepostos
} = require("../utils/horario");
const { statusConclusao, podeEditarOuCancelar, limparNomeFilial } = require("../utils/statusPlantao");
const { montarCrmEscalado, parseCrmLista, sqlFiltroCrmEscalado } = require("../utils/crm");

const SELECT_PLANTAO_ENRIQUECIDO = `
  SELECT
    e.*,
    f.NOMEFANTASIA AS FILIAL_NOME_RAW,
    c.NOME AS SETOR_NOME,
    t.DESCRICAO AS TIPO_DESCRICAO,
    t.TURNO AS TIPO_TURNO,
    t.TIPO AS TIPO_TURNO_TIPO,
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
  const conclusao = statusConclusao(row);
  const crmLista = parseCrmLista(row.CRM_ESCALADO);
  return {
    ...row,
    DATA_INPUT: formatarDataInput(row.DATA),
    HORAINICIO_INPUT: formatarHoraInput(row.HORAINICIO),
    HORAFIM_INPUT: formatarHoraInput(row.HORAFIM),
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    HORARIO_CURTO: `${formatarHoraCurta(row.HORAINICIO)} – ${formatarHoraCurta(row.HORAFIM)}`,
    FILIAL_NOME: limparNomeFilial(row.FILIAL_NOME_RAW) || String(row.CODFILIAL),
    SETOR_NOME: row.SETOR_NOME || row.CODCCUSTO,
    TIPO_NOME: row.TIPO_DESCRICAO
      ? `${row.TIPO_DESCRICAO}${row.TIPO_TURNO ? ` (${row.TIPO_TURNO}${row.TIPO_TURNO_TIPO ? "/" + row.TIPO_TURNO_TIPO : ""})` : ""}`
      : (row.CODTIPOPLANTAO != null ? `Tipo #${row.CODTIPOPLANTAO}` : ""),
    CRM_LISTA: crmLista,
    MEDICO_LABEL: crmLista.length > 1
      ? `${crmLista.length} médicos`
      : (crmLista[0] || row.CRM_ESCALADO),
    CONCLUSAO: conclusao,
    PODE_EDITAR: podeEditarOuCancelar(row)
  };
}

async function enriquecerNomesMedicos(plantoes) {
  const lista = Array.isArray(plantoes) ? plantoes.filter(Boolean) : [];
  if (!lista.length) return lista;

  const todosCrm = [...new Set(lista.flatMap(p => p.CRM_LISTA || parseCrmLista(p.CRM_ESCALADO)))];
  if (!todosCrm.length) return lista;

  const pool = await getPool();
  const request = pool.request();
  const params = todosCrm.map((crm, i) => {
    request.input(`crm${i}`, sql.VarChar, crm);
    return `@crm${i}`;
  });

  const result = await request.query(`
    SELECT LTRIM(RTRIM(CAST(CRM AS VARCHAR(20)))) + LTRIM(RTRIM(CAST(UFCRM AS VARCHAR(5)))) AS CRM_COMPLETO,
           NOMECOMPLETO
    FROM ZMDMEDICOSPJ
    WHERE LTRIM(RTRIM(CAST(CRM AS VARCHAR(20)))) + LTRIM(RTRIM(CAST(UFCRM AS VARCHAR(5)))) IN (${params.join(",")})
  `);

  const mapa = {};
  result.recordset.forEach(r => {
    mapa[String(r.CRM_COMPLETO || "").toUpperCase()] = String(r.NOMECOMPLETO || "").trim();
  });

  return lista.map(p => {
    const crmLista = p.CRM_LISTA || parseCrmLista(p.CRM_ESCALADO);
    const nomes = crmLista.map(c => mapa[c.toUpperCase()] || c);
    return {
      ...p,
      MEDICOS: crmLista.map((crm, i) => ({ crm, nome: nomes[i] })),
      MEDICO_NOME: nomes[0] || null,
      MEDICO_LABEL: nomes.length > 1 ? nomes.join(" · ") : (nomes[0] || p.CRM_ESCALADO)
    };
  });
}

async function listar(filtros = {}) {
  const pool = await getPool();
  const request = pool.request();
  let where = "WHERE 1=1";

  if (filtros.data) {
    request.input("data", sql.Date, filtros.data);
    where += " AND e.DATA = @data";
  }
  if (filtros.codFilial) {
    request.input("codFilial", sql.Int, filtros.codFilial);
    where += " AND e.CODFILIAL = @codFilial";
  }
  if (filtros.status) {
    request.input("status", sql.VarChar, filtros.status);
    where += " AND e.STATUS = @status";
  }

  const result = await request.query(`
    ${SELECT_PLANTAO_ENRIQUECIDO}
    ${where}
    ORDER BY e.DATA DESC, e.HORAINICIO DESC
  `);
  return enriquecerNomesMedicos(result.recordset.map(normalizarPlantao));
}

async function buscarPorId(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query(`
      ${SELECT_PLANTAO_ENRIQUECIDO}
      WHERE e.IDPLANTAO = @id
    `);
  const [plantao] = await enriquecerNomesMedicos([normalizarPlantao(result.recordset[0])]);
  return plantao || null;
}

async function criar(dados, usuario) {
  const crmEscalado = montarCrmEscalado(dados);
  await garantirSemConflito({
    crmEscalado,
    data: dados.data,
    horaInicio: dados.horaInicio,
    horaFim: dados.horaFim
  });

  const pool = await getPool();
  const dataExpiracao = calcularDataExpiracao(dados.data, dados.horaFim);
  const codFilial = parseInt(dados.codFilial, 10);
  if (!Number.isFinite(codFilial)) {
    throw new Error("Filial inválida para gravação do plantão.");
  }

  const result = await pool.request()
    .input("codFilial", sql.Int, codFilial)
    .input("codCCusto", sql.VarChar, dados.codCCusto)
    .input("data", sql.Date, dados.data)
    .input("horaInicio", sql.VarChar, dados.horaInicio)
    .input("horaFim", sql.VarChar, dados.horaFim)
    .input("idEspecialidade", sql.Int, parseIdEspecialidade(dados.idEspecialidade || dados.especialidade))
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar(100), crmEscalado)
    .input("dataExpiracao", sql.DateTime, dataExpiracao)
    .input("criadoPor", sql.VarChar, usuario)
    .query(`
      INSERT INTO ESCALAMEDICA
        (CODFILIAL, EMPRESA, CODCCUSTO, DATA, HORAINICIO, HORAFIM,
         IDESPECIALIDADE, CODTIPOPLANTAO, CRM_ESCALADO, STATUS, DATAEXPIRACAO, RECCREATEDBY)
      OUTPUT INSERTED.IDPLANTAO
      VALUES
        (@codFilial, @codFilial, @codCCusto, @data, @horaInicio, @horaFim,
         @idEspecialidade, @codTipoPlantao, @crmEscalado, 'ABERTO', @dataExpiracao, @criadoPor)
    `);
  return result.recordset[0].IDPLANTAO;
}

async function atualizar(idPlantao, dados) {
  const atual = await buscarPorId(idPlantao);
  if (!atual) throw new Error("Plantão não encontrado");
  if (!atual.PODE_EDITAR) {
    throw new Error("Este plantão já teve ação do médico e não pode mais ser editado.");
  }

  const crmEscalado = montarCrmEscalado(dados);
  await garantirSemConflito({
    crmEscalado,
    data: dados.data,
    horaInicio: dados.horaInicio,
    horaFim: dados.horaFim,
    excluirId: idPlantao
  });

  const pool = await getPool();
  const dataExpiracao = calcularDataExpiracao(dados.data, dados.horaFim);
  const codFilial = parseInt(dados.codFilial, 10);
  if (!Number.isFinite(codFilial)) {
    throw new Error("Filial inválida para gravação do plantão.");
  }

  await pool.request()
    .input("id", sql.Int, idPlantao)
    .input("codFilial", sql.Int, codFilial)
    .input("codCCusto", sql.VarChar, dados.codCCusto)
    .input("data", sql.Date, dados.data)
    .input("horaInicio", sql.VarChar, dados.horaInicio)
    .input("horaFim", sql.VarChar, dados.horaFim)
    .input("idEspecialidade", sql.Int, parseIdEspecialidade(dados.idEspecialidade || dados.especialidade))
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar(100), crmEscalado)
    .input("dataExpiracao", sql.DateTime, dataExpiracao)
    .query(`
      UPDATE ESCALAMEDICA SET
        CODFILIAL = @codFilial, EMPRESA = @codFilial, CODCCUSTO = @codCCusto,
        DATA = @data, HORAINICIO = @horaInicio, HORAFIM = @horaFim,
        IDESPECIALIDADE = @idEspecialidade, CODTIPOPLANTAO = @codTipoPlantao,
        CRM_ESCALADO = @crmEscalado, DATAEXPIRACAO = @dataExpiracao
      WHERE IDPLANTAO = @id
    `);
}

async function buscarConflitosHorario({ crmEscalado, data, horaInicio, horaFim, excluirId = null }) {
  const crms = parseCrmLista(crmEscalado);
  if (!crms.length) return [];

  const pool = await getPool();
  const request = pool.request().input("data", sql.Date, data);
  let whereExtra = "";
  if (excluirId) {
    request.input("excluirId", sql.Int, excluirId);
    whereExtra = "AND e.IDPLANTAO <> @excluirId";
  }

  const orCrm = crms.map((crm, i) => {
    request.input(`crm${i}`, sql.VarChar, crm);
    return `(
      e.CRM_ESCALADO = @crm${i}
      OR e.CRM_ESCALADO LIKE @crm${i} + '|%'
      OR e.CRM_ESCALADO LIKE '%|' + @crm${i} + '|%'
      OR e.CRM_ESCALADO LIKE '%|' + @crm${i}
    )`;
  }).join(" OR ");

  const result = await request.query(`
    SELECT e.IDPLANTAO, e.DATA, e.HORAINICIO, e.HORAFIM, e.STATUS, e.CODFILIAL, e.CODCCUSTO, e.CRM_ESCALADO
    FROM ESCALAMEDICA e
    WHERE (${orCrm})
      AND e.STATUS <> 'CANCELADO'
      AND CAST(e.DATA AS DATE) BETWEEN DATEADD(day, -1, @data) AND DATEADD(day, 1, @data)
      ${whereExtra}
  `);

  return result.recordset.filter(p =>
    horariosSobrepostos(data, horaInicio, horaFim, p.DATA, p.HORAINICIO, p.HORAFIM)
  );
}

async function garantirSemConflito(opts) {
  const conflitos = await buscarConflitosHorario(opts);
  if (!conflitos.length) return;

  const detalhe = conflitos.map(p => {
    const data = formatarDataPt(p.DATA);
    const ini = formatarHoraCurta(p.HORAINICIO);
    const fim = formatarHoraCurta(p.HORAFIM);
    return `#${p.IDPLANTAO} (${data} ${ini}-${fim})`;
  }).join(", ");

  throw new Error(
    `Há médico(s) com plantão no mesmo horário: ${detalhe}. Escolha outro horário ou outros médicos.`
  );
}

function parseIdEspecialidade(valor) {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? n : 0;
}

async function cancelar(idPlantao) {
  const atual = await buscarPorId(idPlantao);
  if (!atual) throw new Error("Plantão não encontrado");
  if (!atual.PODE_EDITAR) {
    throw new Error("Este plantão já teve ação do médico e não pode mais ser cancelado.");
  }

  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("UPDATE ESCALAMEDICA SET STATUS = 'CANCELADO' WHERE IDPLANTAO = @id");
}

function calcularDataExpiracao(data, horaFim) {
  const { h, m } = extrairHoraMinuto(horaFim);
  const base = new Date(data);
  base.setHours(h, m + 15, 0, 0);
  base.setDate(base.getDate() + 30);
  return base;
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  cancelar,
  normalizarPlantao,
  sqlFiltroCrmEscalado
};
