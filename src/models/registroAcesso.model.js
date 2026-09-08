const { sql, getPool } = require("../config/db");

const TOLERANCIA_MIN = 15;

// Plantões do médico hoje, ainda ativos (ABERTO ou EM_ANDAMENTO)
async function plantoesDoDia(crm) {
  const pool = await getPool();
  const result = await pool.request()
    .input("crm", sql.VarChar, crm)
    .query(`
      SELECT * FROM ESCALAMEDICA
      WHERE CRM_ESCALADO = @crm
        AND CAST(DATA AS DATE) = CAST(GETDATE() AS DATE)
        AND STATUS IN ('ABERTO', 'EM_ANDAMENTO')
      ORDER BY HORAINICIO ASC
    `);
  return result.recordset;
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
  return result.recordset;
}

async function registrosDoPlantao(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT * FROM REGISTROACESSO WHERE IDPLANTAO = @id ORDER BY RECCREATEDON ASC");
  return result.recordset;
}

// mssql retorna colunas TIME como objeto Date (data 1970-01-01) em vez de string "HH:MM"
function extrairHoraMinuto(valor) {
  if (valor instanceof Date) {
    return { h: valor.getUTCHours(), m: valor.getUTCMinutes() };
  }
  const [h, m] = String(valor).split(":").map(Number);
  return { h, m };
}

// Determina se ENTRADA ou SAIDA é o próximo passo, e se está dentro da janela permitida
function avaliarJanela(plantao, registros) {
  const proximoTipo = registros.length === 0 ? "ENTRADA" : "SAIDA";
  const horaReferencia = proximoTipo === "ENTRADA" ? plantao.HORAINICIO : plantao.HORAFIM;

  const { h, m } = extrairHoraMinuto(horaReferencia);

  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setHours(h, m, 0, 0);

  const diffMin = Math.abs((agora - alvo) / 60000);
  const dentroDaJanela = diffMin <= TOLERANCIA_MIN;

  return { proximoTipo, dentroDaJanela, diffMin: Math.round(diffMin) };
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

module.exports = { plantoesDoDia, todosPlantoes, registrosDoPlantao, avaliarJanela, registrarBatida, TOLERANCIA_MIN };
