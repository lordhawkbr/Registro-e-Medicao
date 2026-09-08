function statusConclusao(plantao) {
  const status = String(plantao.STATUS || "").toUpperCase();
  const qtdReg = Number(plantao.QTD_REGISTROS || 0);
  const qtdJust = Number(plantao.QTD_JUSTIFICATIVAS || 0);
  const justAprovada = Number(plantao.QTD_JUST_APROVADAS || 0);

  if (status === "CANCELADO") {
    return { codigo: "CANCELADO", label: "Cancelado", classe: "cancelado" };
  }
  if (status === "PENDENTE_JUSTIFICATIVA") {
    return { codigo: "JUSTIFICATIVA_PENDENTE", label: "Justificativa em análise", classe: "pendente_justificativa" };
  }
  if (status === "CONCLUIDO") {
    if (justAprovada > 0 || qtdJust > 0) {
      return { codigo: "JUSTIFICADO", label: "Concluído (justificado)", classe: "justificado" };
    }
    return { codigo: "REGISTRADO", label: "Registrado completamente", classe: "registrado" };
  }
  if (status === "EM_ANDAMENTO" || qtdReg === 1) {
    return { codigo: "PENDENTE_SAIDA", label: "Pendente saída", classe: "pendente_saida" };
  }
  // ABERTO sem ação
  return { codigo: "PENDENTE_ENTRADA", label: "Pendente entrada", classe: "pendente_entrada" };
}

function podeEditarOuCancelar(plantao) {
  const status = String(plantao.STATUS || "").toUpperCase();
  const qtdReg = Number(plantao.QTD_REGISTROS || 0);
  const qtdJust = Number(plantao.QTD_JUSTIFICATIVAS || 0);
  return status === "ABERTO" && qtdReg === 0 && qtdJust === 0;
}

function limparNomeFilial(nome) {
  return String(nome || "").replace(/^HMTJ\s*-\s*/i, "").trim();
}

module.exports = { statusConclusao, podeEditarOuCancelar, limparNomeFilial };
