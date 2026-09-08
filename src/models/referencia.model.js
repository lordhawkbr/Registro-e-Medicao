const { sql, getPool } = require("../config/db");

// GFILIAL: lista para o seletor de filial. Remove o prefixo "HMTJ - " do nome fantasia.
async function listarFiliais() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT CODFILIAL, NOMEFANTASIA
    FROM GFILIAL
    ORDER BY NOMEFANTASIA
  `);
  return result.recordset.map(f => ({
    codFilial: f.CODFILIAL,
    nome: String(f.NOMEFANTASIA).replace("HMTJ - ", "")
  }));
}

// Empresa vem da própria GFILIAL, filtrada pela filial escolhida.
// ASSUNÇÃO: coluna de empresa em GFILIAL chama-se CODFILIAL — ajuste aqui se o nome real for outro.
async function buscarEmpresaPorFilial(codFilial) {
  const pool = await getPool();
  const result = await pool.request()
    .input("codFilial", sql.Int, codFilial)
    .query(`
      SELECT DISTINCT CODFILIAL
      FROM ZMDTIPOPLANTAOMEDICO2
      WHERE CODFILIAL = @codFilial
      AND ATIVO = 1
    `);
  return result.recordset[0] ? result.recordset[0].CODFILIAL : null;
}

// PCCUSTO: centros de custo (setores) da filial, casando NUMEROFILIALCONTAB = CODFILIAL
async function listarSetoresPorFilial(codFilial) {
  const pool = await getPool();
  const result = await pool.request()
    .input("codFilial", sql.Int, codFilial)
    .query(`
      SELECT DISTINCT A.CODFILIAL, A.CODCCUSTO, B.NOME FROM ZMDTIPOPLANTAOMEDICO2 A
      JOIN GCCUSTO B ON A.CODCCUSTO = B.CODCCUSTO
      WHERE A.CODFILIAL = @codFilial
      AND A.ATIVO = 1
      ORDER BY CODFILIAL, NOME  
    `);
  return result.recordset;
}

// ZMDTIPOPLANTAOMEDICO2: tipos de plantão da filial + setor escolhidos
async function listarTiposPlantao(codFilial, codCCusto) {
  const pool = await getPool();
  const result = await pool.request()
    .input("codFilial", sql.Int, codFilial)
    .input("codCCusto", sql.VarChar, codCCusto)
    .query(`
      SELECT IDPRD, DESCRICAO, TURNO, TIPO, ESPECIALIDADE
      FROM ZMDTIPOPLANTAOMEDICO2
      WHERE CODFILIAL = @codFilial AND CODCCUSTO = @codCCusto AND ATIVO = 1
      ORDER BY DESCRICAO
    `);
  return result.recordset;
}

module.exports = { listarFiliais, buscarEmpresaPorFilial, listarSetoresPorFilial, listarTiposPlantao };
