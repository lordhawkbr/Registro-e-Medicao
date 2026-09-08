const bcrypt = require("bcryptjs");
const { sql, getPool } = require("../config/db");

async function autenticar(login, senha) {
  const pool = await getPool();
  const result = await pool.request()
    .input("login", sql.VarChar, login.trim())
    .query(`
      SELECT IDUSUARIO, NOME, LOGIN, SENHA_HASH, PERFIL, ATIVO
      FROM USUARIOSISTEMA
      WHERE LOGIN = @login
    `);

  const usuario = result.recordset[0];
  if (!usuario) return { erro: "Usuário ou senha inválidos." };

  const senhaOk = await bcrypt.compare(senha, usuario.SENHA_HASH);
  if (!senhaOk) return { erro: "Usuário ou senha inválidos." };

  if (String(usuario.ATIVO).trim().toUpperCase() !== "SIM") {
    return { erro: "Usuário inativo." };
  }

  return {
    id: usuario.IDUSUARIO,
    nome: usuario.NOME,
    perfil: usuario.PERFIL
  };
}

module.exports = { autenticar };
