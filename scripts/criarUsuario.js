// Uso: node scripts/criarUsuario.js <login> <senha> <NOME COMPLETO> <PERFIL: ADMIN|ADMINISTRATIVO>
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { sql, getPool } = require("../src/config/db");

async function main() {
  const [login, senha, nome, perfil] = process.argv.slice(2);

  if (!login || !senha || !nome || !perfil) {
    console.log("Uso: node scripts/criarUsuario.js <login> <senha> <NOME COMPLETO> <ADMIN|ADMINISTRATIVO>");
    process.exit(1);
  }
  if (!["ADMIN", "ADMINISTRATIVO"].includes(perfil.toUpperCase())) {
    console.log("Perfil deve ser ADMIN ou ADMINISTRATIVO");
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, 10);
  const pool = await getPool();

  await pool.request()
    .input("nome", sql.VarChar, nome)
    .input("login", sql.VarChar, login)
    .input("senhaHash", sql.VarChar, hash)
    .input("perfil", sql.VarChar, perfil.toUpperCase())
    .query(`
      INSERT INTO USUARIOSISTEMA (NOME, LOGIN, SENHA_HASH, PERFIL, ATIVO)
      VALUES (@nome, @login, @senhaHash, @perfil, 'SIM')
    `);

  console.log(`Usuário ${login} (${perfil.toUpperCase()}) criado com sucesso.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
