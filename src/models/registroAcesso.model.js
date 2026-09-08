const { sql, getPool } = require("../config/db");
const {
  montarDateTimePlantao,
  dataFimPlantao,
  chaveData,
  formatarPeriodoPlantao,
  formatarHoraInput,
  formatarDataInput
} = require("../utils/horario");

const TOLERANCIA_MIN = 15;

function normalizarPlantao(row) {
  if (!row) return row;
  return {
    ...row,
    DATA_INPUT: formatarDataInput(row.DATA),
    HORAINICIO_INPUT: formatarHoraInput(row.HORAINICIO),
    HORAFIM_INPUT: formatarHoraInput(row.HORAFIM),
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    DATA_CHAVE: chaveData(row.DATA)
  };
}

// Plantões do médico hoje, ainda ativos (ABERTO ou EM_ANDAMENTO)
async function plantoesDoDia(crm, dataRef = null) {
  const pool = await getPool();
  const request = pool.request().input("crm", sql.VarChar, crm);
  let filtroData = "AND CAST(DATA AS DATE) = CAST(GETDATE() AS DATE)";

  if (dataRef) {
    request.input("dataRef", sql.Date, dataRef);
    filtroData = "AND CAST(DATA AS DATE) = @dataRef";
  }

  const result = await request.query(`
    SELECT * FROM ESCALAMEDICA
    WHERE CRM_ESCALADO = @crm
      ${filtroData}
      AND STATUS IN ('ABERTO', 'EM_ANDAMENTO', 'PENDENTE_JUSTIFICATIVA')
    ORDER BY HORAINICIO ASC
  `);
  return result.recordset.map(normalizarPlantao);
}

// Todos os plantoes do medico (feitos e pendentes), nao so hoje
async function todosPlantoes(crm) {
  const pool = await getPool();
  const result = await pool.request()
    .input("crm", sql.VarChar, crm)
    .query(`
      SELECT * FROM ESCALAMEDICA
      WHERE CRM_ESCALADO = @crm
      ORDER BY DATA DESC, HORAINICIO DESC
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

// Determina se ENTRADA ou SAIDA é o próximo passo, e se está dentro da janela permitida
function avaliarJanela(plantao, registros) {
  const proximoTipo = registros.length === 0 ? "ENTRADA" : "SAIDA";
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
  // Justificativa só após passar da tolerância (depois do horário + tolerancia)
  const podeJustificar = depoisDaJanela;
  const podeIniciar = dentroDaJanela && plantao.STATUS !== "CONCLUIDO" && plantao.STATUS !== "CANCELADO";

  return {
    proximoTipo,
    dentroDaJanela,
    antesDaJanela,
    depoisDaJanela,
    podeJustificar,
    podeIniciar,
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

  const novoStatus = tipo === "ENTRADA" ? "EM_ANDAMENTO" : "CONCLUIDO";
  await pool.request()
    .input("id", sql.Int, idPlantao)
    .input("status", sql.VarChar, novoStatus)
    .query("UPDATE ESCALAMEDICA SET STATUS = @status WHERE IDPLANTAO = @id");
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
