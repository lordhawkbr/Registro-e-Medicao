const registroModel = require("../models/registroAcesso.model");
const escalaModel = require("../models/escala.model");

async function index(req, res, next) {
  try {
    const crm = req.session.crm;
    const plantoes = await registroModel.plantoesDoDia(crm);

    const plantoesComStatus = [];
    for (const p of plantoes) {
      const registros = await registroModel.registrosDoPlantao(p.IDPLANTAO);
      const avaliacao = registroModel.avaliarJanela(p, registros);
      plantoesComStatus.push({ plantao: p, registros, avaliacao });
    }

    res.render("registroAcesso/index", {
      crm,
      plantoes: plantoesComStatus,
      tolerancia: registroModel.TOLERANCIA_MIN,
      erro: req.query.erro || null,
      plantaoErro: req.query.plantao || null
    });
  } catch (err) {
    next(err);
  }
}

async function bater(req, res, next) {
  try {
    const crm = req.session.crm;
    const idPlantao = req.params.id;

    const plantao = await escalaModel.buscarPorId(idPlantao);
    if (!plantao || plantao.CRM_ESCALADO !== crm) {
      return res.status(403).send("Este plantão não pertence ao médico logado.");
    }

    const registros = await registroModel.registrosDoPlantao(idPlantao);
    const avaliacao = registroModel.avaliarJanela(plantao, registros);

    if (!avaliacao.dentroDaJanela) {
      return res.redirect(`/registro-acesso?erro=fora_da_janela&plantao=${idPlantao}`);
    }

    await registroModel.registrarBatida(idPlantao, crm, avaliacao.proximoTipo);
    res.redirect("/registro-acesso");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, bater };
