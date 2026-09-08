const { sql, getPool } = require("../config/db");
const { formatarPeriodoPlantao } = require("../utils/horario");
const { limparNomeFilial, labelTipoAusencia, labelStatusAprovacao } = require("../utils/statusPlantao");
const { parseCrmLista } = require("../utils/crm");

function normalizarJustificativa(row) {
  if (!row) return row;
  const tipo = labelTipoAusencia(row.TIPOAUSENCIA);
  const aprovacao = labelStatusAprovacao(row.STATUSAPROVACAO);
  return {
    ...row,
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    FILIAL_NOME: limparNomeFilial(row.FILIAL_NOME_RAW) || String(row.CODFILIAL),
    SETOR_NOME: row.SETOR_NOME || row.CODCCUSTO,
    TIPO_LABEL: tipo.label,
    TIPO_CLASSE: tipo.classe,
    STATUS_LABEL: aprovacao.label,
    STATUS_CLASSE: aprovacao.classe
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

  // Só marca o plantão como pendente de justificativa se ainda estiver aberto/em andamento
  // (status por médico é calculado na exibição).
  await pool.request()
    .input("id", sql.Int, dados.idPlantao)
    .query(`
      UPDATE ESCALAMEDICA
      SET STATUS = 'PENDENTE_JUSTIFICATIVA'
      WHERE IDPLANTAO = @id
        AND UPPER(LTRIM(RTRIM(ISNULL(STATUS, '')))) IN ('ABERTO', 'EM_ANDAMENTO', 'PENDENTE_JUSTIFICATIVA')
    `);

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

async function listarPorPlantao(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query(`
      SELECT j.*, e.DATA, e.HORAINICIO, e.HORAFIM, e.CODFILIAL, e.CODCCUSTO,
             f.NOMEFANTASIA AS FILIAL_NOME_RAW, c.NOME AS SETOR_NOME
      FROM JUSTIFICATIVAAUSENCIA j
      INNER JOIN ESCALAMEDICA e ON e.IDPLANTAO = j.IDPLANTAO
      LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
      LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
      WHERE j.IDPLANTAO = @id
      ORDER BY j.RECCREATEDON ASC
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

async function plantaoTotalmenteConcluido(idPlantao) {
  const pool = await getPool();
  const plantaoRes = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT CRM_ESCALADO FROM ESCALAMEDICA WHERE IDPLANTAO = @id");
  const row = plantaoRes.recordset[0];
  if (!row) return false;
  const crms = parseCrmLista(row.CRM_ESCALADO);
  if (!crms.length) return false;

  const regs = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT CRM, TIPO FROM REGISTROACESSO WHERE IDPLANTAO = @id");
  const justs = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("SELECT CRM, STATUSAPROVACAO FROM JUSTIFICATIVAAUSENCIA WHERE IDPLANTAO = @id");

  return crms.every(crm => {
    const key = crm.toUpperCase();
    const regsM = regs.recordset.filter(r => String(r.CRM || "").toUpperCase() === key);
    const justM = justs.recordset.filter(j => String(j.CRM || "").toUpperCase() === key);
    const temSaida = regsM.some(r => r.TIPO === "SAIDA");
    const justAprov = justM.some(j => String(j.STATUSAPROVACAO || "").toUpperCase() === "APROVADO");
    return temSaida || justAprov;
  });
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

  if (statusAprovacao === "APROVADO") {
    const completo = await plantaoTotalmenteConcluido(idPlantao);
    await pool.request()
      .input("id", sql.Int, idPlantao)
      .input("status", sql.VarChar, completo ? "CONCLUIDO" : "EM_ANDAMENTO")
      .query("UPDATE ESCALAMEDICA SET STATUS = @status WHERE IDPLANTAO = @id");
  } else {
    // Reprovado: volta para aberto/em andamento se não houver outras pendentes
    const pendentes = await pool.request()
      .input("id", sql.Int, idPlantao)
      .query(`
        SELECT COUNT(*) AS QTD
        FROM JUSTIFICATIVAAUSENCIA
        WHERE IDPLANTAO = @id AND STATUSAPROVACAO = 'PENDENTE'
      `);
    const qtdPend = Number(pendentes.recordset[0].QTD || 0);
    if (qtdPend === 0) {
      await pool.request()
        .input("id", sql.Int, idPlantao)
        .query(`
          UPDATE ESCALAMEDICA
          SET STATUS = CASE
            WHEN EXISTS (SELECT 1 FROM REGISTROACESSO r WHERE r.IDPLANTAO = ESCALAMEDICA.IDPLANTAO) THEN 'EM_ANDAMENTO'
            ELSE 'ABERTO'
          END
          WHERE IDPLANTAO = @id
        `);
    }
  }
}

module.exports = { criar, listarPorCrm, listarPorPlantao, listarPendentes, aprovar };
