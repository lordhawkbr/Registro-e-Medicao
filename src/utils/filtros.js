function asArray(valor) {
  if (valor == null || valor === "") return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.map(v => String(v).trim()).filter(Boolean);
}

function parseFiltrosEscala(query = {}) {
  const dataInicio = query.dataInicio || query.data || null;
  const dataFim = query.dataFim || query.data || null;
  return {
    dataInicio: dataInicio || null,
    dataFim: dataFim || null,
    // legado single-date
    data: query.data || null,
    codFiliais: asArray(query.codFilial),
    statuses: asArray(query.status),
    codFilial: query.codFilial || null,
    status: query.status || null
  };
}

function parseFiltrosCalendario(query = {}) {
  const mes = String(query.mes || "").trim();
  const mesValido = /^\d{4}-\d{2}$/.test(mes) ? mes : null;
  const statusCal = String(query.statusCal || "").trim().toLowerCase();
  const statusCalValidos = ["realizado", "pendente", "nao_realizado", "cancelado"];
  return {
    mes: mesValido,
    codFilial: query.codFilial ? String(query.codFilial).trim() : "",
    categoria: query.categoria ? String(query.categoria).trim() : "",
    statusCal: statusCalValidos.includes(statusCal) ? statusCal : ""
  };
}

module.exports = { asArray, parseFiltrosEscala, parseFiltrosCalendario };
