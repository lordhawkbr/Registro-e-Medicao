const relatorioModel = require("../models/relatorio.model");
const referenciaModel = require("../models/referencia.model");
const { parseFiltrosEscala } = require("../utils/filtros");

function queryStringFiltros(filtros) {
  const params = new URLSearchParams();
  if (filtros.dataInicio) params.set("dataInicio", filtros.dataInicio);
  if (filtros.dataFim) params.set("dataFim", filtros.dataFim);
  (filtros.codFiliais || []).forEach(f => params.append("codFilial", String(f)));
  (filtros.statuses || []).forEach(s => params.append("status", String(s)));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function index(req, res, next) {
  try {
    const filtros = parseFiltrosEscala(req.query);
    const [{ plantoes, resumo }, filiais] = await Promise.all([
      relatorioModel.listarCompleto(filtros),
      referenciaModel.listarFiliais()
    ]);

    res.render("relatorio/index", {
      plantoes,
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
    const filtros = parseFiltrosEscala(req.query);
    const { linhas } = await relatorioModel.listarCompleto(filtros);
    const buffer = await relatorioModel.gerarXlsx(linhas);
    const dataRef = filtros.dataInicio || filtros.dataFim || new Date().toISOString().slice(0, 10);
    const nomeArquivo = `relatorio-registros-${dataRef}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

module.exports = { index, exportar };
