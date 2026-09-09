const TIPOS_AUSENCIA = {
  ENTRADA_NAO_REGISTRADA: {
    codigo: "ENTRADA_NAO_REGISTRADA",
    label: "Entrada não registrada",
    classe: "tipo-entrada"
  },
  SAIDA_NAO_REGISTRADA: {
    codigo: "SAIDA_NAO_REGISTRADA",
    label: "Saída não registrada",
    classe: "tipo-saida"
  },
  PLANTAO_INTEIRO: {
    codigo: "PLANTAO_INTEIRO",
    label: "Plantão inteiro sem registro",
    classe: "tipo-inteiro"
  }
};

const STATUS_APROVACAO = {
  PENDENTE: { codigo: "PENDENTE", label: "Pendente", classe: "pendente" },
  APROVADO: { codigo: "APROVADO", label: "Aprovado", classe: "aprovado" },
  REPROVADO: { codigo: "REPROVADO", label: "Reprovado", classe: "reprovado" }
};

function labelTipoAusencia(tipo) {
  const key = String(tipo || "").trim().toUpperCase();
  return TIPOS_AUSENCIA[key] || {
    codigo: key || "DESCONHECIDO",
    label: key ? String(tipo) : "Tipo não informado",
    classe: "tipo-outro"
  };
}

function labelStatusAprovacao(status) {
  const key = String(status || "").trim().toUpperCase();
  return STATUS_APROVACAO[key] || {
    codigo: key || "DESCONHECIDO",
    label: key ? String(status) : "—",
    classe: "pendente"
  };
}

function parseDataExpiracao(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Plantão passou da DATAEXPIRACAO (fim + 15 min + 30 dias). */
function estaExpirado(plantao, agora = new Date()) {
  const exp = parseDataExpiracao(plantao?.DATAEXPIRACAO);
  if (!exp) return false;
  return agora.getTime() > exp.getTime();
}

function medicoConcluido(registros = [], justificativas = []) {
  const regs = Array.isArray(registros) ? registros : [];
  const justs = Array.isArray(justificativas) ? justificativas : [];
  const temSaida = regs.some(r => String(r.TIPO || "").toUpperCase() === "SAIDA");
  const justAprov = justs.some(j => String(j.STATUSAPROVACAO || "").toUpperCase() === "APROVADO");
  return temSaida || justAprov;
}

/**
 * Status de conclusão sob a ótica de UM médico (plantão compartilhado).
 * Ignora STATUS global do plantão, exceto CANCELADO.
 */
function statusConclusaoMedico(plantao, registros = [], justificativas = []) {
  const statusPlantao = String(plantao?.STATUS || "").trim().toUpperCase();
  if (statusPlantao === "CANCELADO") {
    return { codigo: "CANCELADO", label: "Cancelado", classe: "cancelado" };
  }

  const regs = Array.isArray(registros) ? registros : [];
  const justs = Array.isArray(justificativas) ? justificativas : [];
  const temEntrada = regs.some(r => String(r.TIPO || "").toUpperCase() === "ENTRADA");
  const temSaida = regs.some(r => String(r.TIPO || "").toUpperCase() === "SAIDA");
  const justPend = justs.find(j => String(j.STATUSAPROVACAO || "").toUpperCase() === "PENDENTE");
  const justAprov = justs.find(j => String(j.STATUSAPROVACAO || "").toUpperCase() === "APROVADO");
  const justReprov = justs.find(j => String(j.STATUSAPROVACAO || "").toUpperCase() === "REPROVADO");
  const completo = Boolean(justAprov) || (temEntrada && temSaida);

  if (justAprov) {
    return { codigo: "JUSTIFICADO", label: "Concluído (justificado)", classe: "justificado" };
  }
  if (temEntrada && temSaida) {
    return { codigo: "REGISTRADO", label: "Registrado completamente", classe: "registrado" };
  }
  if (justPend) {
    return { codigo: "JUSTIFICATIVA_PENDENTE", label: "Justificativa em análise", classe: "pendente_justificativa" };
  }

  // Expirado tem prioridade sobre "pendente" e sobre reprovada antiga
  if (!completo && estaExpirado(plantao)) {
    if (justReprov) {
      return { codigo: "EXPIRADO", label: "Expirado (justificativa reprovada)", classe: "expirado" };
    }
    return { codigo: "EXPIRADO", label: "Expirado", classe: "expirado" };
  }

  if (justReprov) {
    return { codigo: "JUSTIFICATIVA_REPROVADA", label: "Justificativa reprovada", classe: "reprovado" };
  }
  if (temEntrada) {
    return { codigo: "PENDENTE_SAIDA", label: "Pendente saída", classe: "pendente_saida" };
  }
  return { codigo: "PENDENTE_ENTRADA", label: "Pendente entrada", classe: "pendente_entrada" };
}

/** Compat: status agregado do plantão (admin / legado). */
function statusConclusao(plantao) {
  const status = String(plantao.STATUS || "").toUpperCase();
  const qtdReg = Number(plantao.QTD_REGISTROS || 0);
  const justAprovada = Number(plantao.QTD_JUST_APROVADAS || 0);
  const justPend = Number(plantao.QTD_JUST_PENDENTES || 0);
  const justReprov = Number(plantao.QTD_JUST_REPROVADAS || 0);

  if (status === "CANCELADO") {
    return { codigo: "CANCELADO", label: "Cancelado", classe: "cancelado" };
  }
  if (status === "PENDENTE_JUSTIFICATIVA" || justPend > 0) {
    return { codigo: "JUSTIFICATIVA_PENDENTE", label: "Justificativa em análise", classe: "pendente_justificativa" };
  }
  if (status === "CONCLUIDO") {
    if (justAprovada > 0) {
      return { codigo: "JUSTIFICADO", label: "Concluído (justificado)", classe: "justificado" };
    }
    return { codigo: "REGISTRADO", label: "Registrado completamente", classe: "registrado" };
  }

  const incompleto = justAprovada === 0;
  if (incompleto && estaExpirado(plantao)) {
    if (justReprov > 0) {
      return { codigo: "EXPIRADO", label: "Expirado (justificativa reprovada)", classe: "expirado" };
    }
    return { codigo: "EXPIRADO", label: "Expirado", classe: "expirado" };
  }

  if (justReprov > 0) {
    return { codigo: "JUSTIFICATIVA_REPROVADA", label: "Justificativa reprovada", classe: "reprovado" };
  }
  if (status === "EM_ANDAMENTO" || qtdReg === 1) {
    return { codigo: "PENDENTE_SAIDA", label: "Pendente saída", classe: "pendente_saida" };
  }
  return { codigo: "PENDENTE_ENTRADA", label: "Pendente entrada", classe: "pendente_entrada" };
}

function podeEditarOuCancelar(plantao) {
  const status = String(plantao.STATUS || "").toUpperCase();
  const qtdReg = Number(plantao.QTD_REGISTROS || 0);
  const qtdJust = Number(plantao.QTD_JUSTIFICATIVAS || 0);
  return status === "ABERTO" && qtdReg === 0 && qtdJust === 0 && !estaExpirado(plantao);
}

function limparNomeFilial(nome) {
  return String(nome || "").replace(/^HMTJ\s*-\s*/i, "").trim();
}

function resolverNomeEspecialidade(codigo, tipoDescricao) {
  const cod = String(codigo == null ? "" : codigo).trim();
  const tipo = String(tipoDescricao || "").trim();
  if (!cod && !tipo) return "";
  if (cod && /[A-Za-zÀ-ÿ]{3,}/.test(cod) && !/^\d+$/.test(cod)) return cod;
  if (tipo) return tipo;
  return cod;
}

module.exports = {
  TIPOS_AUSENCIA,
  STATUS_APROVACAO,
  labelTipoAusencia,
  labelStatusAprovacao,
  parseDataExpiracao,
  estaExpirado,
  medicoConcluido,
  statusConclusao,
  statusConclusaoMedico,
  podeEditarOuCancelar,
  limparNomeFilial,
  resolverNomeEspecialidade
};
