function exigirPerfil(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.session || !req.session.tipoUsuario) {
      return res.redirect("/login");
    }
    if (!perfisPermitidos.includes(req.session.tipoUsuario)) {
      return res.status(403).send("Você não tem permissão para acessar esta área.");
    }
    next();
  };
}

module.exports = { exigirPerfil };
