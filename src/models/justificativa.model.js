const { sql, getPool } = require("../config/db");
const { formatarPeriodoPlantao } = require("../utils/horario");
const { limparNomeFilial } = require("../utils/statusPlantao");

function normalizarJustificativa(row) {
  if (!row) return row;
  return {
    ...row,
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    FILIAL_NOME: limparNomeFilial(row.FILIAL_NOME_RAW) || String(row.CODFILIAL),
    SETOR_NOME: row.SETOR_NOME || row.CODCCUSTO
  };
}

async function criar(dados, crm) {
  const pool = await getPool();
  const result = await pool.request()
    .input("idPlantao", sql.Int, dados.idPlantao)
    .input("crm", sql.VarChar, crm)
    .input("tipoAusencia", sql.VarChar, dados.tipoAusencia)
    .input("dataHoraReal", sql.DateTime, dados.dataHoraReal || null)
    .input("motivo", sql.VarChar(sql.MAX), dados.motivo)
    .query(`
      INSERT INTO JUSTIFICATIVAAUSENCIA
        (IDPLANTAO, CRM, TIPOAUSENCIA, DATAHORAREAL, MOTIVO, STATUSAPROVACAO)
      OUTPUT INSERTED.IDJUSTIFICATIVA
      VALUES
        (@idPlantao, @crm, @tipoAusencia, @dataHoraReal, @motivo, 'PENDENTE')
    `);

  await pool.request()
    .input("id", sql.Int, dados.idPlantao)
    .query("UPDATE ESCALAMEDICA SET STATUS = 'PENDENTE_JUSTIFICATIVA' WHERE IDPLANTAO = @id");

  return result.recordset[0].IDJUSTIFICATIVA;
}

async function listarPorCrm(crm) {
  const pool = await getPool();
  const result = await pool.request()
    .input("crm", sql.VarChar, crm)
    .query(`
      SELECT j.*, e.DATA, e.HORAINICIO, e.HORAFIM, e.CODFILIAL, e.CODCCUSTO,
             f.NOMEFANTASIA AS FILIAL_NOME_RAW, c.NOME AS SETOR_NOME
      FROM JUSTIFICATIVAAUSENCIA j
      INNER JOIN ESCALAMEDICA e ON e.IDPLANTAO = j.IDPLANTAO
      LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
      LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
      WHERE j.CRM = @crm
      ORDER BY j.RECCREATEDON DESC
    `);
  return result.recordset.map(normalizarJustificativa);
}

async function listarPendentes() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT j.*, e.DATA, e.HORAINICIO, e.HORAFIM, e.CODFILIAL, e.CODCCUSTO,
           f.NOMEFANTASIA AS FILIAL_NOME_RAW, c.NOME AS SETOR_NOME
    FROM JUSTIFICATIVAAUSENCIA j
    INNER JOIN ESCALAMEDICA e ON e.IDPLANTAO = j.IDPLANTAO
    LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
    LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
    WHERE j.STATUSAPROVACAO = 'PENDENTE'
    ORDER BY j.RECCREATEDON ASC
  `);
  return result.recordset.map(normalizarJustificativa);
}

async function aprovar(idJustificativa, aprovadoPor, statusAprovacao) {
  const pool = await getPool();

  const result = await pool.request()
    .input("id", sql.Int, idJustificativa)
    .input("status", sql.VarChar, statusAprovacao)
    .input("aprovadoPor", sql.VarChar, aprovadoPor)
    .query(`
      UPDATE JUSTIFICATIVAAUSENCIA SET
        STATUSAPROVACAO = @status,
        APROVADOPOR = @aprovadoPor,
        DATAAPROVACAO = GETDATE()
      OUTPUT INSERTED.IDPLANTAO
      WHERE IDJUSTIFICATIVA = @id
    `);

  const idPlantao = result.recordset[0].IDPLANTAO;
  const novoStatusPlantao = statusAprovacao === "APROVADO" ? "CONCLUIDO" : "ABERTO";

  await pool.request()
    .input("id", sql.Int, idPlantao)
    .input("status", sql.VarChar, novoStatusPlantao)
    .query("UPDATE ESCALAMEDICA SET STATUS = @status WHERE IDPLANTAO = @id");
}

module.exports = { criar, listarPorCrm, listarPendentes, aprovar };
