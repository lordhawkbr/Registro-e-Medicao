const { sql, getPool } = require("../config/db");
const { extrairHoraMinuto, formatarPeriodoPlantao, formatarHoraInput, formatarDataInput } = require("../utils/horario");

function normalizarPlantao(row) {
  if (!row) return row;
  return {
    ...row,
    DATA_INPUT: formatarDataInput(row.DATA),
    HORAINICIO_INPUT: formatarHoraInput(row.HORAINICIO),
    HORAFIM_INPUT: formatarHoraInput(row.HORAFIM),
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM)
  };
}

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
  return result.recordset.map(normalizarPlantao);
}

async function buscarPorId(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT * FROM ESCALAMEDICA WHERE IDPLANTAO = @id");
  return normalizarPlantao(result.recordset[0]);
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
    .input("idEspecialidade", sql.Int, parseIdEspecialidade(dados.idEspecialidade || dados.especialidade))
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar, montarCrmEscalado(dados))
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
    .input("idEspecialidade", sql.Int, parseIdEspecialidade(dados.idEspecialidade || dados.especialidade))
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar, montarCrmEscalado(dados))
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

function parseIdEspecialidade(valor) {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? n : 0;
}

function montarCrmEscalado(dados) {
  const crm = String(dados.crmEscalado || dados.crm || "").trim();
  const uf = String(dados.ufCrm || dados.ufcrm || "").trim().toUpperCase();
  if (uf && !crm.toUpperCase().endsWith(uf)) return `${crm}${uf}`;
  return crm;
}

async function cancelar(idPlantao) {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("UPDATE ESCALAMEDICA SET STATUS = 'CANCELADO' WHERE IDPLANTAO = @id");
}

// HORAFIM + 15min de tolerancia + 30 dias = prazo para expirar sem registro/justificativa
function calcularDataExpiracao(data, horaFim) {
  const { h, m } = extrairHoraMinuto(horaFim);
  const base = new Date(data);
  base.setHours(h, m + 15, 0, 0);
  base.setDate(base.getDate() + 30);
  return base;
}

module.exports = { listar, buscarPorId, criar, atualizar, cancelar, normalizarPlantao };
