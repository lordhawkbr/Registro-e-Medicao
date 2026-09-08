const { sql, getPool } = require("../config/db");

async function listar(filtros = {}) {
  const pool = await getPool();
  const request = pool.request();
  let where = "WHERE 1=1";

  if (filtros.data) {
    request.input("data", sql.Date, filtros.data);
    where += " AND DATA = @data";
  }
  if (filtros.codFilial) {
    request.input("codFilial", sql.Int, filtros.codFilial);
    where += " AND CODFILIAL = @codFilial";
  }
  if (filtros.status) {
    request.input("status", sql.VarChar, filtros.status);
    where += " AND STATUS = @status";
  }

  const result = await request.query(`
    SELECT * FROM ESCALAMEDICA
    ${where}
    ORDER BY DATA DESC, HORAINICIO ASC
  `);
  return result.recordset;
}

async function buscarPorId(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT * FROM ESCALAMEDICA WHERE IDPLANTAO = @id");
  return result.recordset[0];
}

async function criar(dados, usuario) {
  const pool = await getPool();
  const dataExpiracao = calcularDataExpiracao(dados.data, dados.horaFim);

  const result = await pool.request()
    .input("codFilial", sql.Int, dados.codFilial)
    .input("empresa", sql.Int, dados.empresa)
    .input("codCCusto", sql.VarChar, dados.codCCusto)
    .input("data", sql.Date, dados.data)
    .input("horaInicio", sql.VarChar, dados.horaInicio)
    .input("horaFim", sql.VarChar, dados.horaFim)
    .input("idEspecialidade", sql.Int, dados.idEspecialidade)
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar, dados.crmEscalado)
    .input("dataExpiracao", sql.DateTime, dataExpiracao)
    .input("criadoPor", sql.VarChar, usuario)
    .query(`
      INSERT INTO ESCALAMEDICA
        (CODFILIAL, EMPRESA, CODCCUSTO, DATA, HORAINICIO, HORAFIM,
         IDESPECIALIDADE, CODTIPOPLANTAO, CRM_ESCALADO, STATUS, DATAEXPIRACAO, RECCREATEDBY)
      OUTPUT INSERTED.IDPLANTAO
      VALUES
        (@codFilial, @empresa, @codCCusto, @data, @horaInicio, @horaFim,
         @idEspecialidade, @codTipoPlantao, @crmEscalado, 'ABERTO', @dataExpiracao, @criadoPor)
    `);
  return result.recordset[0].IDPLANTAO;
}

async function atualizar(idPlantao, dados) {
  const pool = await getPool();
  const dataExpiracao = calcularDataExpiracao(dados.data, dados.horaFim);

  await pool.request()
    .input("id", sql.Int, idPlantao)
    .input("codFilial", sql.Int, dados.codFilial)
    .input("empresa", sql.Int, dados.empresa)
    .input("codCCusto", sql.VarChar, dados.codCCusto)
    .input("data", sql.Date, dados.data)
    .input("horaInicio", sql.VarChar, dados.horaInicio)
    .input("horaFim", sql.VarChar, dados.horaFim)
    .input("idEspecialidade", sql.Int, dados.idEspecialidade)
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar, dados.crmEscalado)
    .input("dataExpiracao", sql.DateTime, dataExpiracao)
    .query(`
      UPDATE ESCALAMEDICA SET
        CODFILIAL = @codFilial, EMPRESA = @empresa, CODCCUSTO = @codCCusto,
        DATA = @data, HORAINICIO = @horaInicio, HORAFIM = @horaFim,
        IDESPECIALIDADE = @idEspecialidade, CODTIPOPLANTAO = @codTipoPlantao,
        CRM_ESCALADO = @crmEscalado, DATAEXPIRACAO = @dataExpiracao
      WHERE IDPLANTAO = @id
    `);
}

async function cancelar(idPlantao) {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("UPDATE ESCALAMEDICA SET STATUS = 'CANCELADO' WHERE IDPLANTAO = @id");
}

// mssql retorna colunas TIME como objeto Date (data 1970-01-01) em vez de string "HH:MM"
function extrairHoraMinuto(valor) {
  if (valor instanceof Date) {
    return { h: valor.getUTCHours(), m: valor.getUTCMinutes() };
  }
  const [h, m] = String(valor).split(":").map(Number);
  return { h, m };
}

// HORAFIM + 15min de tolerancia + 30 dias = prazo para expirar sem registro/justificativa
function calcularDataExpiracao(data, horaFim) {
  const { h, m } = extrairHoraMinuto(horaFim);
  const base = new Date(data);
  base.setHours(h, m + 15, 0, 0);
  base.setDate(base.getDate() + 30);
  return base;
}

module.exports = { listar, buscarPorId, criar, atualizar, cancelar };
