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

module.exports = { asArray, parseFiltrosEscala };
