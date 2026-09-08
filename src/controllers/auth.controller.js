const medicoModel = require("../models/medico.model");
const usuarioModel = require("../models/usuario.model");

function loginForm(req, res) {
  res.render("auth/login", { erro: null, layout: false });
}

async function loginMedico(req, res, next) {
  try {
    const { crm, crmUf, cpf } = req.body;

    if (!crm || !crmUf || !cpf) {
      return res.render("auth/login", { erro: "Preencha CRM, UF e CPF.", layout: false });
    }

    const medico = await medicoModel.autenticar(crm.trim(), crmUf.trim(), cpf);

    if (medico.erro) {
      return res.render("auth/login", { erro: medico.erro, layout: false });
    }

    req.session.tipoUsuario = "MEDICO";
    req.session.crm = medico.crm;
    req.session.nome = medico.nome;
    res.redirect("/painel");
  } catch (err) {
    next(err);
  }
}

async function loginAdmin(req, res, next) {
  try {
    const { login, senha } = req.body;

    if (!login || !senha) {
      return res.render("auth/login", { erro: "Preencha login e senha.", layout: false });
    }

    const usuario = await usuarioModel.autenticar(login, senha);

    if (usuario.erro) {
      return res.render("auth/login", { erro: usuario.erro, layout: false });
    }

    req.session.tipoUsuario = usuario.perfil;
    req.session.login = usuario.login;
    req.session.nome = usuario.email;
    req.session.unidades = usuario.unidades;
    res.redirect("/escala");
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect("/login"));
}

module.exports = { loginForm, loginMedico, loginAdmin, logout };
