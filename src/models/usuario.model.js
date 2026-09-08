const crypto = require("crypto");
const { sql, getPool, getPoolFluig } = require("../config/db");

function md5(texto) {
  return crypto.createHash("md5").update(texto).digest("hex");
}

// Login administrativo/admin: FDN_USERTENANT fica no banco do Fluig (outro database)
// USUARIOPERFIL/USUARIOUNIDADE ficam no banco principal desta aplicação
async function autenticar(login, senha) {
  const poolFluig = await getPoolFluig();
  const pool = await getPool();

  const result = await poolFluig.request()
    .input("login", sql.VarChar, login.trim())
    .query(`
      SELECT LOGIN, EMAIL, PASSWORD, USER_STATE
      FROM FDN_USERTENANT
      WHERE LOGIN = @login
    `);

  const usuario = result.recordset[0];
  if (!usuario) return { erro: "Login ou senha inválidos." };

  const senhaHash = md5(senha);
  if (String(usuario.PASSWORD).toLowerCase() !== senhaHash.toLowerCase()) {
    return { erro: "Login ou senha inválidos." };
  }

  const perfilResult = await pool.request()
    .input("login", sql.VarChar, login.trim())
    .query(`
      SELECT IDUSUARIOPERFIL, PERFIL, ATIVO
      FROM USUARIOPERFIL
      WHERE LOGIN = @login
    `);

  const perfilRow = perfilResult.recordset[0];
  if (!perfilRow) return { erro: "Usuário sem perfil de acesso cadastrado no sistema." };
  if (!perfilRow.ATIVO) return { erro: "Usuário inativo. Procure o administrador." };

  let unidades = [];
  if (perfilRow.PERFIL === "ADMINISTRATIVO") {
    const unidadesResult = await pool.request()
      .input("id", sql.Int, perfilRow.IDUSUARIOPERFIL)
      .query("SELECT CODFILIAL FROM USUARIOUNIDADE WHERE IDUSUARIOPERFIL = @id");
    unidades = unidadesResult.recordset.map(r => r.CODFILIAL);
  }

  return {
    login: usuario.LOGIN,
    email: usuario.EMAIL,
    perfil: perfilRow.PERFIL,
    unidades
  };
}

module.exports = { autenticar };
