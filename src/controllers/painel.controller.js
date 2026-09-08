const registroModel = require("../models/registroAcesso.model");
const justificativaModel = require("../models/justificativa.model");

async function index(req, res, next) {
  try {
    const crm = req.session.crm;
    const tab = req.query.tab === "justificativas" ? "justificativas" : "registros";

    const todosPlantoes = await registroModel.todosPlantoes(crm);

    const plantoesComRegistros = [];
    for (const p of todosPlantoes) {
      const registros = await registroModel.registrosDoPlantao(p.IDPLANTAO);
      plantoesComRegistros.push({ plantao: p, registros });
    }

    const pendentes = plantoesComRegistros.filter(
      p => p.plantao.STATUS === "ABERTO" || p.plantao.STATUS === "EM_ANDAMENTO"
    );
    const concluidos = plantoesComRegistros.filter(
      p => p.plantao.STATUS === "CONCLUIDO" || p.plantao.STATUS === "CANCELADO" || p.plantao.STATUS === "PENDENTE_JUSTIFICATIVA"
    );

    const justificativas = await justificativaModel.listarPorCrm(crm);

    res.render("painel/index", {
      nome: req.session.nome,
      crm,
      tab,
      pendentes,
      concluidos,
      justificativas
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
