const escalaModel = require("../models/escala.model");
const referenciaModel = require("../models/referencia.model");
const { parseFiltrosEscala, parseFiltrosCalendario } = require("../utils/filtros");
const { formatarDataInput } = require("../utils/horario");
const {
  STATUS_CALENDARIO,
  statusCalendario,
  montarCalendarioAdmin,
  estatisticasCalendario,
  categoriasDoMes
} = require("../utils/calendario");

async function index(req, res, next) {
  try {
    const filtros = parseFiltrosEscala(req.query);
    const [plantoes, filiais] = await Promise.all([
      escalaModel.listar(filtros),
      referenciaModel.listarFiliais()
    ]);
    res.render("escala/index", {
      plantoes,
      filtros,
      filiais,
      containerClass: "container-lista",
      adminNav: "plantoes"
    });
  } catch (err) {
    next(err);
  }
}

async function calendario(req, res, next) {
  try {
    const filtrosCal = parseFiltrosCalendario(req.query);
    const mes = filtrosCal.mes || formatarDataInput(new Date()).slice(0, 7);
    const dataInicio = `${mes}-01`;
    const [ano, mesNum] = mes.split("-").map(Number);
    const ultimoDia = new Date(ano, mesNum, 0).getDate();
    const dataFim = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

    const filtrosBase = {
      dataInicio,
      dataFim,
      codFiliais: filtrosCal.codFilial ? [filtrosCal.codFilial] : [],
      statuses: []
    };

    const filtrosTotal = {
      codFiliais: filtrosCal.codFilial ? [filtrosCal.codFilial] : [],
      statuses: []
    };

    const [plantoesMes, totalGeral, filiais] = await Promise.all([
      escalaModel.listar(filtrosBase),
      escalaModel.contar(filtrosTotal),
      referenciaModel.listarFiliais()
    ]);

    const hojeChave = formatarDataInput(new Date());
    let plantoes = plantoesMes.map(p => ({
      ...p,
      STATUS_CAL: statusCalendario(p, hojeChave)
    }));

    if (filtrosCal.categoria) {
      plantoes = plantoes.filter(p => {
        const key = String(p.ESPECIALIDADE_CODIGO || p.IDESPECIALIDADE || p.ESPECIALIDADE_NOME || "");
        return key === filtrosCal.categoria;
      });
    }

    if (filtrosCal.statusCal) {
      plantoes = plantoes.filter(p => p.STATUS_CAL.key === filtrosCal.statusCal);
    }

    const categorias = categoriasDoMes(plantoesMes);
    const calendarioView = montarCalendarioAdmin(plantoes, mes, { maxVisiveis: 3 });
    const stats = estatisticasCalendario(plantoes, totalGeral, hojeChave);

    const porDiaJson = {};
    Object.entries(calendarioView.porDia || {}).forEach(([chave, lista]) => {
      porDiaJson[chave] = (lista || []).map(ev => ({
        IDPLANTAO: ev.IDPLANTAO,
        TITULO_CAL: ev.TITULO_CAL,
        PODE_EDITAR: !!ev.PODE_EDITAR,
        STATUS_CAL: ev.STATUS_CAL
      }));
    });

    res.render("escala/calendario", {
      calendario: calendarioView,
      porDiaJson,
      filtros: { ...filtrosCal, mes },
      filiais,
      categorias,
      stats,
      statusLegenda: Object.values(STATUS_CALENDARIO),
      containerClass: "container-lista container-calendario",
      adminNav: "calendario"
    });
  } catch (err) {
    next(err);
  }
}

async function novo(req, res, next) {
  try {
    const filiais = await referenciaModel.listarFiliais();
    const dataPrefill = req.query.data && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.data))
      ? String(req.query.data)
      : null;
    const origem = req.query.origem === "calendario" ? "calendario" : null;
    res.render("escala/form", {
      plantao: dataPrefill ? { DATA_INPUT: dataPrefill, data: dataPrefill } : null,
      erro: null,
      filiais,
      origem,
      containerClass: "container-form"
    });
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const usuario = req.session.login || req.session.nome || "sistema";
    await escalaModel.criar(req.body, usuario);
    if (req.body.origem === "calendario" && req.body.data) {
      const mes = String(req.body.data).slice(0, 7);
      return res.redirect(`/escala/calendario?mes=${encodeURIComponent(mes)}`);
    }
    res.redirect("/escala");
  } catch (err) {
    const filiais = await referenciaModel.listarFiliais();
    res.render("escala/form", {
      plantao: req.body,
      erro: err.message,
      filiais,
      origem: req.body.origem === "calendario" ? "calendario" : null,
      containerClass: "container-form"
    });
  }
}

async function editar(req, res, next) {
  try {
    const plantao = await escalaModel.buscarPorId(req.params.id);
    if (!plantao) return res.status(404).send("Plantão não encontrado");
    if (!plantao.PODE_EDITAR) {
      return res.status(403).send("Este plantão já teve ação do médico e não pode mais ser editado.");
    }
    const filiais = await referenciaModel.listarFiliais();
    res.render("escala/form", {
      plantao,
      erro: null,
      filiais,
      origem: null,
      containerClass: "container-form"
    });
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
    res.render("escala/form", {
      plantao,
      erro: err.message,
      filiais,
      origem: null,
      containerClass: "container-form"
    });
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

module.exports = { index, calendario, novo, criar, editar, atualizar, cancelar };
