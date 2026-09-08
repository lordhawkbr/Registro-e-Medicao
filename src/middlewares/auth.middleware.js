function exigirLogin(req, res, next) {
  if (!req.session || !req.session.perfil) {
    return res.redirect("/login");
  }
  next();
}

// Uso: exigirPerfil("ADMIN", "ADMINISTRATIVO")
function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.session || !req.session.perfil) {
      return res.redirect("/login");
    }
    if (!perfis.includes(req.session.perfil)) {
      return res.status(403).send("Você não tem permissão para acessar esta página.");
    }
    next();
  };
}

module.exports = { exigirLogin, exigirPerfil };
