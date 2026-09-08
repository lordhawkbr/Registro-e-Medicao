const { formatarDataInput, DIAS_SEMANA } = require("./horario");

const STATUS_CALENDARIO = {
  realizado: { key: "realizado", label: "Realizado", classe: "cal-evt-realizado" },
  pendente: { key: "pendente", label: "Pendente", classe: "cal-evt-pendente" },
  nao_realizado: { key: "nao_realizado", label: "Não realizado", classe: "cal-evt-nao-realizado" },
  cancelado: { key: "cancelado", label: "Cancelado", classe: "cal-evt-cancelado" }
};

/**
 * Status visual do calendário (legenda): Realizado / Pendente / Não realizado / Cancelado.
 */
function statusCalendario(plantao, hojeChave = formatarDataInput(new Date())) {
  const codigo = String(plantao?.CONCLUSAO?.codigo || plantao?.STATUS || "").toUpperCase();
  if (codigo === "CANCELADO") return STATUS_CALENDARIO.cancelado;
  if (codigo === "REGISTRADO" || codigo === "JUSTIFICADO" || codigo === "CONCLUIDO") {
    return STATUS_CALENDARIO.realizado;
  }

  const dataPlantao = plantao?.DATA_INPUT || formatarDataInput(plantao?.DATA) || "";
  const passado = dataPlantao && dataPlantao < hojeChave;
  // Passado sem registro de entrada = não realizado
  if (passado && (codigo === "PENDENTE_ENTRADA" || codigo === "ABERTO" || !codigo)) {
    return STATUS_CALENDARIO.nao_realizado;
  }
  return STATUS_CALENDARIO.pendente;
}

function tituloEvento(plantao) {
  const hora = plantao.HORARIO_CURTO || "";
  const medico = plantao.MEDICO_NOME || plantao.MEDICO_LABEL || plantao.CRM_ESCALADO || "";
  const especialidade = plantao.ESPECIALIDADE_NOME || plantao.TIPO_DESCRICAO || "";
  const filial = plantao.FILIAL_NOME || "";
  if (medico && especialidade) return `${hora} ${especialidade}`.trim();
  if (medico) return `${hora} ${medico}`.trim();
  if (especialidade) return `${hora} ${especialidade}`.trim();
  if (filial) return `${hora} ${filial}`.trim();
  return `${hora} Plantão #${plantao.IDPLANTAO}`.trim();
}

function mesParaChave(ano, mesIndex0) {
  return `${ano}-${String(mesIndex0 + 1).padStart(2, "0")}`;
}

function deslocarMes(mesRef, delta) {
  const [y, m] = String(mesRef).split("-").map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return mesParaChave(d.getFullYear(), d.getMonth());
}

/**
 * Monta grade mensal com plantões por dia (visão admin).
 */
function montarCalendarioAdmin(plantoes, mesRef, opts = {}) {
  const maxVisiveis = opts.maxVisiveis != null ? opts.maxVisiveis : 3;
  const base = mesRef ? new Date(`${mesRef}-01T12:00:00`) : new Date();
  const ano = base.getFullYear();
  const mes = base.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);
  const hojeChave = formatarDataInput(new Date());

  const porDia = {};
  (plantoes || []).forEach(plantao => {
    const chave = plantao.DATA_INPUT || formatarDataInput(plantao.DATA);
    if (!chave) return;
    if (!porDia[chave]) porDia[chave] = [];
    const status = statusCalendario(plantao, hojeChave);
    porDia[chave].push({
      ...plantao,
      STATUS_CAL: status,
      TITULO_CAL: tituloEvento(plantao)
    });
  });

  Object.keys(porDia).forEach(chave => {
    porDia[chave].sort((a, b) =>
      String(a.HORAINICIO_INPUT || "").localeCompare(String(b.HORAINICIO_INPUT || ""))
    );
  });

  const dias = [];
  for (let i = 0; i < primeiro.getDay(); i++) {
    dias.push({ vazio: true });
  }

  for (let d = 1; d <= ultimo.getDate(); d++) {
    const data = new Date(ano, mes, d);
    const chave = formatarDataInput(data);
    const lista = porDia[chave] || [];
    const visiveis = lista.slice(0, maxVisiveis);
    const ocultos = Math.max(0, lista.length - visiveis.length);
    dias.push({
      vazio: false,
      dia: d,
      chave,
      hoje: chave === hojeChave,
      temPlantao: lista.length > 0,
      qtd: lista.length,
      eventos: visiveis,
      ocultos,
      todos: lista
    });
  }

  const mesLabel = primeiro.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const mesAtual = mesParaChave(ano, mes);

  return {
    ano,
    mes: mes + 1,
    mesLabel,
    diasSemana: DIAS_SEMANA.map(d => `${d.slice(0, 3).toLowerCase()}.`),
    dias,
    mesAtual,
    mesAnterior: deslocarMes(mesAtual, -1),
    mesProximo: deslocarMes(mesAtual, 1),
    hojeChave,
    porDia
  };
}

function estatisticasCalendario(plantoesMes, totalGeral, hojeChave = formatarDataInput(new Date())) {
  const lista = Array.isArray(plantoesMes) ? plantoesMes : [];
  let pendentes = 0;
  let concluidos = 0;
  let naoRealizados = 0;
  let cancelados = 0;

  lista.forEach(p => {
    const st = statusCalendario(p, hojeChave);
    if (st.key === "realizado") concluidos += 1;
    else if (st.key === "pendente") pendentes += 1;
    else if (st.key === "nao_realizado") naoRealizados += 1;
    else if (st.key === "cancelado") cancelados += 1;
  });

  return {
    total: Number(totalGeral != null ? totalGeral : lista.length) || 0,
    esteMes: lista.length,
    pendentes,
    concluidos,
    naoRealizados,
    cancelados
  };
}

function categoriasDoMes(plantoes) {
  const mapa = new Map();
  (plantoes || []).forEach(p => {
    const cod = p.ESPECIALIDADE_CODIGO || p.IDESPECIALIDADE || "";
    const nome = p.ESPECIALIDADE_NOME || p.TIPO_DESCRICAO || "";
    if (!cod && !nome) return;
    const key = String(cod || nome);
    if (!mapa.has(key)) {
      mapa.set(key, { codigo: key, nome: nome || `Especialidade ${key}` });
    }
  });
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

module.exports = {
  STATUS_CALENDARIO,
  statusCalendario,
  tituloEvento,
  montarCalendarioAdmin,
  estatisticasCalendario,
  categoriasDoMes,
  deslocarMes,
  mesParaChave
};
