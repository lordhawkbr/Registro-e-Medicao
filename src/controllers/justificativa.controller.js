const justificativaModel = require("../models/justificativa.model");
const escalaModel = require("../models/escala.model");

async function novo(req, res, next) {
  try {
    const idPlantao = req.query.idPlantao;
    const plantao = idPlantao ? await escalaModel.buscarPorId(idPlantao) : null;
    res.render("justificativa/form", { plantao, erro: null });
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const crm = req.session.crm;
    await justificativaModel.criar(req.body, crm);
    res.redirect("/justificativa");
  } catch (err) {
    const plantao = await escalaModel.buscarPorId(req.body.idPlantao);
    res.render("justificativa/form", { plantao, erro: err.message });
  }
}

async function index(req, res, next) {
  try {
    const crm = req.session.crm;
    const justificativas = await justificativaModel.listarPorCrm(crm);
    res.render("justificativa/index", { justificativas });
  } catch (err) {
    next(err);
  }
}

async function pendentes(req, res, next) {
  try {
    const justificativas = await justificativaModel.listarPendentes();
    res.render("justificativa/pendentes", { justificativas });
  } catch (err) {
    next(err);
  }
}

async function aprovar(req, res, next) {
  try {
    const aprovadoPor = req.session.login || req.session.nome;
    await justificativaModel.aprovar(req.params.id, aprovadoPor, req.body.decisao);
    res.redirect("/justificativa/pendentes");
  } catch (err) {
    next(err);
  }
}

module.exports = { novo, criar, index, pendentes, aprovar };
