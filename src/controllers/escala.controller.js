const escalaModel = require("../models/escala.model");
const referenciaModel = require("../models/referencia.model");

async function index(req, res, next) {
  try {
    const filtros = {
      data: req.query.data || null,
      codFilial: req.query.codFilial || null,
      status: req.query.status || null
    };
    const plantoes = await escalaModel.listar(filtros);
    res.render("escala/index", { plantoes, filtros });
  } catch (err) {
    next(err);
  }
}

async function novo(req, res, next) {
  try {
    const filiais = await referenciaModel.listarFiliais();
    res.render("escala/form", { plantao: null, erro: null, filiais });
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const usuario = req.session.login || req.session.nome || "sistema";
    await escalaModel.criar(req.body, usuario);
    res.redirect("/escala");
  } catch (err) {
    const filiais = await referenciaModel.listarFiliais();
    res.render("escala/form", { plantao: req.body, erro: err.message, filiais });
  }
}

async function editar(req, res, next) {
  try {
    const plantao = await escalaModel.buscarPorId(req.params.id);
    if (!plantao) return res.status(404).send("Plantão não encontrado");
    const filiais = await referenciaModel.listarFiliais();
    res.render("escala/form", { plantao, erro: null, filiais });
  } catch (err) {
    next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    await escalaModel.atualizar(req.params.id, req.body);
    res.redirect("/escala");
  } catch (err) {
    const plantao = { ...req.body, IDPLANTAO: req.params.id };
    const filiais = await referenciaModel.listarFiliais();
    res.render("escala/form", { plantao, erro: err.message, filiais });
  }
}

async function cancelar(req, res, next) {
  try {
    await escalaModel.cancelar(req.params.id);
    res.redirect("/escala");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, novo, criar, editar, atualizar, cancelar };
