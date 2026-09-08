const registroModel = require("../models/registroAcesso.model");
const justificativaModel = require("../models/justificativa.model");
const { chaveData, formatarDataInput, DIAS_SEMANA } = require("../utils/horario");

function montarCalendario(plantoes, mesRef) {
  const base = mesRef ? new Date(`${mesRef}-01T12:00:00`) : new Date();
  const ano = base.getFullYear();
  const mes = base.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);
  const hojeChave = formatarDataInput(new Date());

  const porDia = {};
  plantoes.forEach(({ plantao }) => {
    const chave = plantao.DATA_CHAVE || chaveData(plantao.DATA);
    if (!porDia[chave]) porDia[chave] = [];
    porDia[chave].push(plantao);
  });

  const dias = [];
  // Preenche início da semana (domingo = 0)
  for (let i = 0; i < primeiro.getDay(); i++) {
    dias.push({ vazio: true });
  }

  for (let d = 1; d <= ultimo.getDate(); d++) {
    const data = new Date(ano, mes, d);
    const chave = formatarDataInput(data);
    const lista = porDia[chave] || [];
    dias.push({
      vazio: false,
      dia: d,
      chave,
      hoje: chave === hojeChave,
      temPlantao: lista.length > 0,
      qtd: lista.length,
      ativos: lista.filter(p => p.STATUS === "ABERTO" || p.STATUS === "EM_ANDAMENTO").length
    });
  }

  const mesLabel = primeiro.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const mesAnterior = new Date(ano, mes - 1, 1);
  const mesProximo = new Date(ano, mes + 1, 1);

  return {
    ano,
    mes: mes + 1,
    mesLabel,
    diasSemana: DIAS_SEMANA.map(d => d.slice(0, 3)),
    dias,
    mesAtual: `${ano}-${String(mes + 1).padStart(2, "0")}`,
    mesAnterior: `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`,
    mesProximo: `${mesProximo.getFullYear()}-${String(mesProximo.getMonth() + 1).padStart(2, "0")}`,
    porDia
  };
}

async function index(req, res, next) {
  try {
    const crm = req.session.crm;
    const tab = req.query.tab === "justificativas" ? "justificativas" : "plantoes";
    const mes = req.query.mes || formatarDataInput(new Date()).slice(0, 7);
    const diaSelecionado = req.query.dia || formatarDataInput(new Date());

    const todosPlantoes = await registroModel.todosPlantoes(crm);

    const plantoesComRegistros = [];
    for (const p of todosPlantoes) {
      const registros = await registroModel.registrosDoPlantao(p.IDPLANTAO);
      const avaliacao = registroModel.avaliarJanela(p, registros);
      plantoesComRegistros.push({ plantao: p, registros, avaliacao });
    }

    const calendario = montarCalendario(plantoesComRegistros, mes);
    const doDia = plantoesComRegistros.filter(
      ({ plantao }) => (plantao.DATA_CHAVE || chaveData(plantao.DATA)) === diaSelecionado
    );

    const justificativas = await justificativaModel.listarPorCrm(crm);
    // Filtra justificativas apenas dos plantões registrados (do médico)
    const idsPlantoes = new Set(todosPlantoes.map(p => p.IDPLANTAO));
    const justificativasFiltradas = justificativas.filter(j => idsPlantoes.has(j.IDPLANTAO));

    res.render("painel/index", {
      nome: req.session.nome,
      crm,
      tab,
      calendario,
      diaSelecionado,
      plantoesDoDia: doDia,
      justificativas: justificativasFiltradas,
      tolerancia: registroModel.TOLERANCIA_MIN
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
