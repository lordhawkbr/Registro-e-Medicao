const referenciaModel = require("../models/referencia.model");

async function empresaPorFilial(req, res, next) {
  try {
    const empresa = await referenciaModel.buscarEmpresaPorFilial(req.params.codFilial);
    res.json({ empresa });
  } catch (err) {
    next(err);
  }
}

async function setoresPorFilial(req, res, next) {
  try {
    const setores = await referenciaModel.listarSetoresPorFilial(req.params.codFilial);
    res.json(setores);
  } catch (err) {
    next(err);
  }
}

async function tiposPlantao(req, res, next) {
  try {
    const { codFilial, codCCusto } = req.query;
    if (!codFilial || !codCCusto) return res.json([]);
    const tipos = await referenciaModel.listarTiposPlantao(codFilial, codCCusto);
    res.json(tipos);
  } catch (err) {
    next(err);
  }
}

module.exports = { empresaPorFilial, setoresPorFilial, tiposPlantao };
