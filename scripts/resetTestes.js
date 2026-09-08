/**
 * Reset de dados de teste — Escala Médica
 *
 * Remove plantões, batidas, justificativas e trocas.
 * Mantém USUARIOPERFIL e USUARIOUNIDADE.
 * Não toca no Fluig (FDN_USERTENANT) nem em cadastros externos.
 *
 * Uso:
 *   node scripts/resetTestes.js --confirm
 *   npm run reset:testes
 *
 * Variáveis: mesmas do .env (DB_*).
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { sql, getPool } = require("../src/config/db");

const TABELAS_LIMPAR = [
  "REGISTROACESSO",
  "JUSTIFICATIVAAUSENCIA",
  "ESCALATROCA",
  "ESCALAMEDICA"
];

const TABELAS_MANTER = ["USUARIOPERFIL", "USUARIOUNIDADE"];

async function contar(pool, tabela) {
  const result = await pool.request().query(`SELECT COUNT(*) AS QTD FROM ${tabela}`);
  return Number(result.recordset[0].QTD || 0);
}

async function tabelaExiste(pool, tabela) {
  const result = await pool.request()
    .input("tabela", sql.VarChar, tabela)
    .query(`
      SELECT 1 AS OK
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tabela
    `);
  return result.recordset.length > 0;
}

async function main() {
  const confirmado = process.argv.includes("--confirm");
  if (!confirmado) {
    console.log(`
Reset de dados de teste (mantém perfis de usuário).

Apaga: ${TABELAS_LIMPAR.join(", ")}
Mantém: ${TABELAS_MANTER.join(", ")}

Para executar de fato:
  node scripts/resetTestes.js --confirm
  npm run reset:testes
`);
    process.exit(0);
  }

  if (!process.env.DB_SERVER || !process.env.DB_DATABASE) {
    console.error("Configure DB_SERVER e DB_DATABASE no .env antes de rodar.");
    process.exit(1);
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  console.log(`Banco: ${process.env.DB_DATABASE} @ ${process.env.DB_SERVER}`);
  console.log("--- Antes ---");

  const antes = {};
  for (const t of [...TABELAS_LIMPAR, ...TABELAS_MANTER]) {
    if (!(await tabelaExiste(pool, t))) {
      console.log(`${t}: (tabela ausente)`);
      continue;
    }
    antes[t] = await contar(pool, t);
    console.log(`${t}: ${antes[t]}`);
  }

  await tx.begin();
  try {
    const req = new sql.Request(tx);

    for (const t of TABELAS_LIMPAR) {
      if (!(await tabelaExiste(pool, t))) continue;
      await req.query(`DELETE FROM ${t}`);
      await req.query(`
        IF EXISTS (
          SELECT 1 FROM sys.identity_columns
          WHERE object_id = OBJECT_ID('dbo.${t}')
        )
        DBCC CHECKIDENT ('dbo.${t}', RESEED, 0);
      `);
      console.log(`Limpo: ${t}`);
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  console.log("--- Depois ---");
  for (const t of [...TABELAS_LIMPAR, ...TABELAS_MANTER]) {
    if (!(await tabelaExiste(pool, t))) continue;
    const qtd = await contar(pool, t);
    console.log(`${t}: ${qtd}`);
  }

  // Espelho SQL disponível em sql/reset_testes.sql
  const sqlPath = path.join(__dirname, "..", "sql", "reset_testes.sql");
  if (fs.existsSync(sqlPath)) {
    console.log(`\nScript SQL equivalente: ${sqlPath}`);
  }

  console.log("\nReset de testes concluído. Perfis de usuário preservados.");
  process.exit(0);
}

main().catch(err => {
  console.error("Falha no reset:", err.message || err);
  process.exit(1);
});
