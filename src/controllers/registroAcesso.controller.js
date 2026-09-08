const registroModel = require("../models/registroAcesso.model");
const escalaModel = require("../models/escala.model");
const justificativaModel = require("../models/justificativa.model");
const { formatarDataInput } = require("../utils/horario");
const { crmPertenceAoPlantao } = require("../utils/crm");
const { statusConclusaoMedico } = require("../utils/statusPlantao");

async function index(req, res, next) {
  try {
    const crm = req.session.crm;
    const data = req.query.data || formatarDataInput(new Date());
    const plantoes = await registroModel.plantoesDoDia(crm, data);

    const plantoesComStatus = [];
    for (const p of plantoes) {
      const registrosTodos = await registroModel.registrosDoPlantao(p.IDPLANTAO);
      const avaliacao = registroModel.avaliarJanela(p, registrosTodos, crm);
      const registros = registrosTodos.filter(r => String(r.CRM || "").toUpperCase() === String(crm).toUpperCase());
      const justs = await justificativaModel.listarPorPlantao(p.IDPLANTAO);
      const justsMedico = justs.filter(j => String(j.CRM || "").toUpperCase() === String(crm).toUpperCase());
      const conclusao = statusConclusaoMedico(p, registros, justsMedico);
      plantoesComStatus.push({
        plantao: { ...p, CONCLUSAO: conclusao },
        registros,
        avaliacao,
        justificativas: justsMedico
      });
    }

    res.render("registroAcesso/index", {
      crm,
      nome: req.session.nome,
      data,
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
    if (!plantao || !crmPertenceAoPlantao(plantao.CRM_ESCALADO, crm)) {
      return res.status(403).send("Este plantão não pertence ao médico logado.");
    }

    const registros = await registroModel.registrosDoPlantao(idPlantao);
    const avaliacao = registroModel.avaliarJanela(plantao, registros, crm);

    if (!avaliacao.podeIniciar) {
      return res.redirect(`/registro-acesso?erro=fora_da_janela&plantao=${idPlantao}&data=${plantao.DATA_INPUT || ""}`);
    }

    await registroModel.registrarBatida(idPlantao, crm, avaliacao.proximoTipo);
    res.redirect(`/registro-acesso?data=${plantao.DATA_INPUT || ""}`);
  } catch (err) {
    next(err);
  }
}

module.exports = { index, bater };
