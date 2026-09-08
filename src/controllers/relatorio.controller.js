const relatorioModel = require("../models/relatorio.model");
const referenciaModel = require("../models/referencia.model");

function lerFiltros(query) {
  return {
    data: query.data || null,
    codFilial: query.codFilial || null,
    status: query.status || null
  };
}

function queryStringFiltros(filtros) {
  const params = new URLSearchParams();
  if (filtros.data) params.set("data", filtros.data);
  if (filtros.codFilial) params.set("codFilial", String(filtros.codFilial));
  if (filtros.status) params.set("status", filtros.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function index(req, res, next) {
  try {
    const filtros = lerFiltros(req.query);
    const [{ linhas, resumo }, filiais] = await Promise.all([
      relatorioModel.listarCompleto(filtros),
      referenciaModel.listarFiliais()
    ]);

    res.render("relatorio/index", {
      linhas,
      resumo,
      filtros,
      filiais,
      exportQuery: queryStringFiltros(filtros),
      containerClass: "container-lista",
      adminNav: "relatorio"
    });
  } catch (err) {
    next(err);
  }
}

async function exportar(req, res, next) {
  try {
    const filtros = lerFiltros(req.query);
    const { linhas } = await relatorioModel.listarCompleto(filtros);
    const csv = relatorioModel.gerarCsv(linhas);
    const dataRef = filtros.data || new Date().toISOString().slice(0, 10);
    const nomeArquivo = `relatorio-registros-${dataRef}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = { index, exportar };
