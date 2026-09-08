const { sql, getPool } = require("../config/db");
const {
  montarDateTimePlantao,
  dataFimPlantao,
  formatarPeriodoPlantao,
  formatarHoraInput,
  formatarDataInput,
  formatarDataPt,
  formatarHoraCurta
} = require("../utils/horario");
const { statusConclusao, limparNomeFilial } = require("../utils/statusPlantao");
const { parseCrmLista } = require("../utils/crm");

const TOLERANCIA_MIN = 15;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Formata hora de TIME (UTC epoch) ou DATETIME local. */
function formatarHoraEvento(valor) {
  if (valor == null || valor === "") return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const isTimeOnly = valor.getUTCFullYear() === 1970
      && valor.getUTCMonth() === 0
      && valor.getUTCDate() === 1;
    if (isTimeOnly) return formatarHoraInput(valor);
    return `${pad2(valor.getHours())}:${pad2(valor.getMinutes())}`;
  }
  return formatarHoraInput(valor);
}

/** Formata data de DATE (meia-noite UTC) ou DATETIME local. */
function formatarDataEvento(valor) {
  if (valor == null || valor === "") return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const isDateOnly = valor.getUTCHours() === 0
      && valor.getUTCMinutes() === 0
      && valor.getUTCSeconds() === 0
      && valor.getUTCMilliseconds() === 0;
    if (isDateOnly) return formatarDataPt(valor);
    return `${pad2(valor.getDate())}/${pad2(valor.getMonth() + 1)}/${valor.getFullYear()}`;
  }
  return formatarDataPt(valor);
}

const LABELS_TIPO_EVENTO = {
  REGISTRO: "Registro de acesso",
  JUSTIFICATIVA: "Justificativa",
  SEM_ACAO: "Sem ação registrada"
};

const LABELS_TIPO_REGISTRO = {
  ENTRADA: "Entrada",
  SAIDA: "Saída"
};

const LABELS_TIPO_AUSENCIA = {
  ENTRADA_NAO_REGISTRADA: "Entrada não registrada",
  SAIDA_NAO_REGISTRADA: "Saída não registrada",
  PLANTAO_INTEIRO: "Plantão inteiro"
};

const LABELS_SITUACAO = {
  DENTRO_PRAZO: "Dentro do prazo",
  FORA_PRAZO: "Fora do prazo",
  JUSTIFICATIVA_PENDENTE: "Justificativa pendente",
  JUSTIFICATIVA_APROVADA: "Justificativa aprovada",
  JUSTIFICATIVA_REPROVADA: "Justificativa reprovada",
  PENDENTE: "Pendente de registro",
  CANCELADO: "Cancelado"
};

const CLASSES_SITUACAO = {
  DENTRO_PRAZO: "registrado",
  FORA_PRAZO: "pendente_saida",
  JUSTIFICATIVA_PENDENTE: "pendente_justificativa",
  JUSTIFICATIVA_APROVADA: "justificado",
  JUSTIFICATIVA_REPROVADA: "cancelado",
  PENDENTE: "pendente_entrada",
  CANCELADO: "cancelado"
};

function aplicarFiltros(request, filtros = {}) {
  let where = "WHERE 1=1";

  if (filtros.data) {
    request.input("data", sql.Date, filtros.data);
    where += " AND e.DATA = @data";
  }
  if (filtros.codFilial) {
    request.input("codFilial", sql.Int, filtros.codFilial);
    where += " AND e.CODFILIAL = @codFilial";
  }
  if (filtros.status) {
    request.input("status", sql.VarChar, filtros.status);
    where += " AND e.STATUS = @status";
  }

  return where;
}

function montarDateTimeBatida(dataBatida, horaBatida) {
  return montarDateTimePlantao(dataBatida, horaBatida);
}

function classificarRegistro(plantao, registro) {
  const tipo = String(registro.TIPO || "").toUpperCase();
  let alvo = null;

  if (tipo === "ENTRADA") {
    alvo = montarDateTimePlantao(plantao.DATA, plantao.HORAINICIO);
  } else if (tipo === "SAIDA") {
    const dataFim = dataFimPlantao(plantao.DATA, plantao.HORAINICIO, plantao.HORAFIM);
    alvo = montarDateTimePlantao(dataFim, plantao.HORAFIM);
  }

  const batida = montarDateTimeBatida(registro.DATABATIDA, registro.HORABATIDA);
  if (!alvo || !batida) {
    return {
      situacao: "FORA_PRAZO",
      situacaoLabel: LABELS_SITUACAO.FORA_PRAZO,
      situacaoClasse: CLASSES_SITUACAO.FORA_PRAZO,
      diffMin: null,
      dentroDoPrazo: false
    };
  }

  const diffMs = batida.getTime() - alvo.getTime();
  const diffMin = Math.round(Math.abs(diffMs) / 60000);
  const dentroDoPrazo = diffMin <= TOLERANCIA_MIN;
  const situacao = dentroDoPrazo ? "DENTRO_PRAZO" : "FORA_PRAZO";

  return {
    situacao,
    situacaoLabel: LABELS_SITUACAO[situacao],
    situacaoClasse: CLASSES_SITUACAO[situacao],
    diffMin,
    dentroDoPrazo,
    atrasado: !dentroDoPrazo && diffMs > 0,
    antecipado: !dentroDoPrazo && diffMs < 0
  };
}

function situacaoJustificativa(statusAprovacao) {
  const status = String(statusAprovacao || "").toUpperCase();
  if (status === "APROVADO") {
    return {
      situacao: "JUSTIFICATIVA_APROVADA",
      situacaoLabel: LABELS_SITUACAO.JUSTIFICATIVA_APROVADA,
      situacaoClasse: CLASSES_SITUACAO.JUSTIFICATIVA_APROVADA
    };
  }
  if (status === "REPROVADO") {
    return {
      situacao: "JUSTIFICATIVA_REPROVADA",
      situacaoLabel: LABELS_SITUACAO.JUSTIFICATIVA_REPROVADA,
      situacaoClasse: CLASSES_SITUACAO.JUSTIFICATIVA_REPROVADA
    };
  }
  return {
    situacao: "JUSTIFICATIVA_PENDENTE",
    situacaoLabel: LABELS_SITUACAO.JUSTIFICATIVA_PENDENTE,
    situacaoClasse: CLASSES_SITUACAO.JUSTIFICATIVA_PENDENTE
  };
}

async function mapearNomesMedicos(crms) {
  const todosCrm = [...new Set((crms || []).filter(Boolean))];
  if (!todosCrm.length) return {};

  const pool = await getPool();
  const request = pool.request();
  const params = todosCrm.map((crm, i) => {
    request.input(`crm${i}`, sql.VarChar, crm);
    return `@crm${i}`;
  });

  const result = await request.query(`
    SELECT LTRIM(RTRIM(CAST(CRM AS VARCHAR(20)))) + LTRIM(RTRIM(CAST(UFCRM AS VARCHAR(5)))) AS CRM_COMPLETO,
           NOMECOMPLETO
    FROM ZMDMEDICOSPJ
    WHERE LTRIM(RTRIM(CAST(CRM AS VARCHAR(20)))) + LTRIM(RTRIM(CAST(UFCRM AS VARCHAR(5)))) IN (${params.join(",")})
  `);

  const mapa = {};
  result.recordset.forEach(r => {
    mapa[String(r.CRM_COMPLETO || "").toUpperCase()] = String(r.NOMECOMPLETO || "").trim();
  });
  return mapa;
}

function basePlantao(row) {
  const crmLista = parseCrmLista(row.CRM_ESCALADO);
  return {
    idPlantao: row.IDPLANTAO,
    data: formatarDataInput(row.DATA),
    dataFmt: formatarDataPt(row.DATA),
    horario: `${formatarHoraCurta(row.HORAINICIO)} – ${formatarHoraCurta(row.HORAFIM)}`,
    horarioCompleto: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    codFilial: row.CODFILIAL,
    filial: limparNomeFilial(row.FILIAL_NOME_RAW) || String(row.CODFILIAL),
    setor: row.SETOR_NOME || row.CODCCUSTO,
    statusPlantao: row.STATUS,
    conclusao: statusConclusao({
      STATUS: row.STATUS,
      QTD_REGISTROS: row.QTD_REGISTROS,
      QTD_JUSTIFICATIVAS: row.QTD_JUSTIFICATIVAS,
      QTD_JUST_APROVADAS: row.QTD_JUST_APROVADAS
    }),
    crmEscalado: row.CRM_ESCALADO,
    crmLista
  };
}

function montarLinhasRelatorio(plantoes, registros, justificativas, mapaNomes) {
  const regsPorPlantao = new Map();
  const justPorPlantao = new Map();

  registros.forEach(r => {
    const id = r.IDPLANTAO;
    if (!regsPorPlantao.has(id)) regsPorPlantao.set(id, []);
    regsPorPlantao.get(id).push(r);
  });

  justificativas.forEach(j => {
    const id = j.IDPLANTAO;
    if (!justPorPlantao.has(id)) justPorPlantao.set(id, []);
    justPorPlantao.get(id).push(j);
  });

  const linhas = [];

  plantoes.forEach(p => {
    const base = basePlantao(p);
    const regs = regsPorPlantao.get(p.IDPLANTAO) || [];
    const justs = justPorPlantao.get(p.IDPLANTAO) || [];
    const statusUpper = String(p.STATUS || "").toUpperCase();

    regs.forEach(r => {
      const classif = classificarRegistro(p, r);
      const crm = String(r.CRM || "").trim();
      linhas.push({
        ...base,
        tipoEvento: "REGISTRO",
        tipoEventoLabel: LABELS_TIPO_EVENTO.REGISTRO,
        tipoDetalhe: String(r.TIPO || "").toUpperCase(),
        tipoDetalheLabel: LABELS_TIPO_REGISTRO[String(r.TIPO || "").toUpperCase()] || r.TIPO,
        crm,
        medicoNome: mapaNomes[crm.toUpperCase()] || crm || "—",
        dataEvento: formatarDataEvento(r.DATABATIDA),
        horaEvento: formatarHoraEvento(r.HORABATIDA) || String(r.HORABATIDA || ""),
        motivo: "",
        statusAprovacao: "",
        idOrigem: r.IDREGISTRO,
        ...classif
      });
    });

    justs.forEach(j => {
      const sit = situacaoJustificativa(j.STATUSAPROVACAO);
      const crm = String(j.CRM || "").trim();
      linhas.push({
        ...base,
        tipoEvento: "JUSTIFICATIVA",
        tipoEventoLabel: LABELS_TIPO_EVENTO.JUSTIFICATIVA,
        tipoDetalhe: String(j.TIPOAUSENCIA || "").toUpperCase(),
        tipoDetalheLabel: LABELS_TIPO_AUSENCIA[String(j.TIPOAUSENCIA || "").toUpperCase()] || j.TIPOAUSENCIA,
        crm,
        medicoNome: mapaNomes[crm.toUpperCase()] || crm || "—",
        dataEvento: formatarDataEvento(j.RECCREATEDON || j.DATAHORAREAL),
        horaEvento: formatarHoraEvento(j.RECCREATEDON || j.DATAHORAREAL),
        motivo: String(j.MOTIVO || "").trim(),
        statusAprovacao: String(j.STATUSAPROVACAO || "").toUpperCase(),
        idOrigem: j.IDJUSTIFICATIVA,
        diffMin: null,
        dentroDoPrazo: false,
        ...sit
      });
    });

    if (!regs.length && !justs.length) {
      const situacao = statusUpper === "CANCELADO" ? "CANCELADO" : "PENDENTE";
      const crmLista = base.crmLista.length ? base.crmLista : [""];
      crmLista.forEach(crm => {
        linhas.push({
          ...base,
          tipoEvento: "SEM_ACAO",
          tipoEventoLabel: LABELS_TIPO_EVENTO.SEM_ACAO,
          tipoDetalhe: "",
          tipoDetalheLabel: "—",
          crm: crm || base.crmEscalado,
          medicoNome: (crm && mapaNomes[crm.toUpperCase()]) || mapaNomes[String(base.crmEscalado || "").toUpperCase()] || crm || base.crmEscalado || "—",
          dataEvento: "",
          horaEvento: "",
          motivo: "",
          statusAprovacao: "",
          idOrigem: null,
          situacao,
          situacaoLabel: LABELS_SITUACAO[situacao],
          situacaoClasse: CLASSES_SITUACAO[situacao],
          diffMin: null,
          dentroDoPrazo: false
        });
      });
    }
  });

  return linhas;
}

function resumirLinhas(linhas) {
  const resumo = {
    total: linhas.length,
    registrosDentroPrazo: 0,
    registrosForaPrazo: 0,
    justificativas: 0,
    justificativasPendentes: 0,
    justificativasAprovadas: 0,
    justificativasReprovadas: 0,
    semAcao: 0,
    plantoes: new Set()
  };

  linhas.forEach(l => {
    resumo.plantoes.add(l.idPlantao);
    if (l.tipoEvento === "REGISTRO") {
      if (l.situacao === "DENTRO_PRAZO") resumo.registrosDentroPrazo += 1;
      else resumo.registrosForaPrazo += 1;
    } else if (l.tipoEvento === "JUSTIFICATIVA") {
      resumo.justificativas += 1;
      if (l.situacao === "JUSTIFICATIVA_PENDENTE") resumo.justificativasPendentes += 1;
      if (l.situacao === "JUSTIFICATIVA_APROVADA") resumo.justificativasAprovadas += 1;
      if (l.situacao === "JUSTIFICATIVA_REPROVADA") resumo.justificativasReprovadas += 1;
    } else if (l.tipoEvento === "SEM_ACAO") {
      resumo.semAcao += 1;
    }
  });

  return {
    ...resumo,
    plantoes: resumo.plantoes.size
  };
}

async function listarCompleto(filtros = {}) {
  const pool = await getPool();
  const request = pool.request();
  const where = aplicarFiltros(request, filtros);

  const plantoesResult = await request.query(`
    SELECT
      e.*,
      f.NOMEFANTASIA AS FILIAL_NOME_RAW,
      c.NOME AS SETOR_NOME,
      (
        SELECT COUNT(*) FROM REGISTROACESSO r WHERE r.IDPLANTAO = e.IDPLANTAO
      ) AS QTD_REGISTROS,
      (
        SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j WHERE j.IDPLANTAO = e.IDPLANTAO
      ) AS QTD_JUSTIFICATIVAS,
      (
        SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j
        WHERE j.IDPLANTAO = e.IDPLANTAO AND j.STATUSAPROVACAO = 'APROVADO'
      ) AS QTD_JUST_APROVADAS
    FROM ESCALAMEDICA e
    LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
    LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
    ${where}
    ORDER BY e.DATA DESC, e.HORAINICIO DESC, e.IDPLANTAO DESC
  `);

  const plantoes = plantoesResult.recordset;
  if (!plantoes.length) {
    return { linhas: [], resumo: resumirLinhas([]) };
  }

  const ids = plantoes.map(p => p.IDPLANTAO);
  const reqRegs = pool.request();
  const reqJust = pool.request();
  const idParams = ids.map((id, i) => {
    reqRegs.input(`id${i}`, sql.Int, id);
    reqJust.input(`id${i}`, sql.Int, id);
    return `@id${i}`;
  });

  const [regsResult, justResult] = await Promise.all([
    reqRegs.query(`
      SELECT *
      FROM REGISTROACESSO
      WHERE IDPLANTAO IN (${idParams.join(",")})
      ORDER BY IDPLANTAO, RECCREATEDON ASC, IDREGISTRO ASC
    `),
    reqJust.query(`
      SELECT *
      FROM JUSTIFICATIVAAUSENCIA
      WHERE IDPLANTAO IN (${idParams.join(",")})
      ORDER BY IDPLANTAO, RECCREATEDON ASC, IDJUSTIFICATIVA ASC
    `)
  ]);

  const registros = regsResult.recordset;
  const justificativas = justResult.recordset;

  const crms = [
    ...plantoes.flatMap(p => parseCrmLista(p.CRM_ESCALADO)),
    ...registros.map(r => r.CRM),
    ...justificativas.map(j => j.CRM)
  ];
  const mapaNomes = await mapearNomesMedicos(crms);
  const linhas = montarLinhasRelatorio(plantoes, registros, justificativas, mapaNomes);

  return {
    linhas,
    resumo: resumirLinhas(linhas)
  };
}

function escaparCsv(valor) {
  const str = valor == null ? "" : String(valor);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function gerarCsv(linhas) {
  const cabecalho = [
    "ID Plantão",
    "Data plantão",
    "Horário",
    "Filial",
    "Setor",
    "Status plantão",
    "Conclusão",
    "CRM",
    "Médico",
    "Tipo evento",
    "Detalhe",
    "Data evento",
    "Hora evento",
    "Situação",
    "Diferença (min)",
    "Status aprovação",
    "Motivo"
  ];

  const rows = linhas.map(l => [
    l.idPlantao,
    l.dataFmt,
    l.horario,
    l.filial,
    l.setor,
    l.statusPlantao,
    l.conclusao ? l.conclusao.label : "",
    l.crm,
    l.medicoNome,
    l.tipoEventoLabel,
    l.tipoDetalheLabel,
    l.dataEvento,
    l.horaEvento,
    l.situacaoLabel,
    l.diffMin != null ? l.diffMin : "",
    l.statusAprovacao,
    l.motivo
  ].map(escaparCsv).join(","));

  return `\uFEFF${cabecalho.join(",")}\n${rows.join("\n")}\n`;
}

module.exports = {
  listarCompleto,
  gerarCsv,
  classificarRegistro,
  TOLERANCIA_MIN,
  LABELS_SITUACAO,
  LABELS_TIPO_EVENTO
};
