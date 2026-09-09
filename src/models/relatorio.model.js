const ExcelJS = require("exceljs");
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
const {
  statusConclusao,
  statusConclusaoMedico,
  limparNomeFilial,
  labelTipoAusencia,
  labelStatusAprovacao
} = require("../utils/statusPlantao");
const { parseCrmLista } = require("../utils/crm");

const TOLERANCIA_MIN = 15;

const LABELS_TIPO_REGISTRO = {
  ENTRADA: "Entrada",
  SAIDA: "Saída"
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

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

function aplicarFiltros(request, filtros = {}) {
  let where = "WHERE 1=1";

  const dataInicio = filtros.dataInicio || filtros.data || null;
  const dataFim = filtros.dataFim || filtros.data || null;
  if (dataInicio && dataFim) {
    request.input("dataInicio", sql.Date, dataInicio);
    request.input("dataFim", sql.Date, dataFim);
    where += " AND e.DATA BETWEEN @dataInicio AND @dataFim";
  } else if (dataInicio) {
    request.input("dataInicio", sql.Date, dataInicio);
    where += " AND e.DATA >= @dataInicio";
  } else if (dataFim) {
    request.input("dataFim", sql.Date, dataFim);
    where += " AND e.DATA <= @dataFim";
  }

  const filiais = Array.isArray(filtros.codFiliais)
    ? filtros.codFiliais
    : (filtros.codFilial ? [].concat(filtros.codFilial) : []);
  if (filiais.length) {
    const parts = filiais.map((f, i) => {
      request.input(`filial${i}`, sql.Int, parseInt(f, 10));
      return `@filial${i}`;
    });
    where += ` AND e.CODFILIAL IN (${parts.join(",")})`;
  }

  const statuses = Array.isArray(filtros.statuses)
    ? filtros.statuses
    : (filtros.status ? [].concat(filtros.status) : []);
  if (statuses.length) {
    const parts = statuses.map((s, i) => {
      request.input(`status${i}`, sql.VarChar, s);
      return `@status${i}`;
    });
    where += ` AND e.STATUS IN (${parts.join(",")})`;
  }

  return where;
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

  const batida = montarDateTimePlantao(registro.DATABATIDA, registro.HORABATIDA);
  if (!alvo || !batida) {
    return {
      situacao: "FORA_PRAZO",
      situacaoLabel: "Fora do prazo",
      situacaoClasse: "pendente_saida",
      diffMin: null,
      dentroDoPrazo: false
    };
  }

  const diffMs = batida.getTime() - alvo.getTime();
  const diffMin = Math.round(Math.abs(diffMs) / 60000);
  const dentroDoPrazo = diffMin <= TOLERANCIA_MIN;

  return {
    situacao: dentroDoPrazo ? "DENTRO_PRAZO" : "FORA_PRAZO",
    situacaoLabel: dentroDoPrazo ? "Dentro do prazo" : "Fora do prazo",
    situacaoClasse: dentroDoPrazo ? "registrado" : "pendente_saida",
    diffMin,
    dentroDoPrazo,
    atrasado: !dentroDoPrazo && diffMs > 0,
    antecipado: !dentroDoPrazo && diffMs < 0
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

function detalharRegistros(plantao, registros) {
  return (registros || []).map(r => {
    const tipo = String(r.TIPO || "").toUpperCase();
    const classif = classificarRegistro(plantao, r);
    return {
      ...r,
      tipo,
      tipoLabel: LABELS_TIPO_REGISTRO[tipo] || r.TIPO,
      dataFmt: formatarDataEvento(r.DATABATIDA),
      horaFmt: formatarHoraEvento(r.HORABATIDA),
      ...classif
    };
  });
}

function detalharJustificativas(justificativas) {
  return (justificativas || []).map(j => {
    const tipoInfo = labelTipoAusencia(j.TIPOAUSENCIA);
    const statusInfo = labelStatusAprovacao(j.STATUSAPROVACAO);
    return {
      ...j,
      tipoLabel: tipoInfo.label,
      tipoClasse: tipoInfo.classe,
      statusLabel: statusInfo.label,
      statusClasse: statusInfo.classe,
      dataFmt: formatarDataEvento(j.RECCREATEDON || j.DATAHORAREAL),
      horaFmt: formatarHoraEvento(j.RECCREATEDON || j.DATAHORAREAL),
      motivo: String(j.MOTIVO || "").trim(),
      situacao: statusInfo.codigo === "APROVADO"
        ? "JUSTIFICATIVA_APROVADA"
        : statusInfo.codigo === "REPROVADO"
          ? "JUSTIFICATIVA_REPROVADA"
          : "JUSTIFICATIVA_PENDENTE",
      situacaoLabel: statusInfo.codigo === "APROVADO"
        ? "Justificativa aprovada"
        : statusInfo.codigo === "REPROVADO"
          ? "Justificativa reprovada"
          : "Justificativa pendente",
      situacaoClasse: statusInfo.codigo === "APROVADO"
        ? "justificado"
        : statusInfo.codigo === "REPROVADO"
          ? "cancelado"
          : "pendente_justificativa"
    };
  });
}

function montarPlantoesRelatorio(plantoes, registros, justificativas, mapaNomes) {
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

  return plantoes.map(p => {
    const crmLista = parseCrmLista(p.CRM_ESCALADO);
    const regs = regsPorPlantao.get(p.IDPLANTAO) || [];
    const justs = justPorPlantao.get(p.IDPLANTAO) || [];
    const regsDet = detalharRegistros(p, regs);
    const justDet = detalharJustificativas(justs);

    const medicos = (crmLista.length ? crmLista : [""]).map(crm => {
      const crmKey = String(crm || "").toUpperCase();
      const regsM = regsDet.filter(r => String(r.CRM || "").toUpperCase() === crmKey);
      const justM = justDet.filter(j => String(j.CRM || "").toUpperCase() === crmKey);
      const nome = (crm && mapaNomes[crmKey]) || crm || p.CRM_ESCALADO || "—";
      return {
        crm: crm || p.CRM_ESCALADO,
        nome,
        CONCLUSAO: statusConclusaoMedico(p, regsM, justM),
        REGISTROS: regsM,
        JUSTIFICATIVAS: justM
      };
    });

    return {
      ...p,
      DATA_INPUT: formatarDataInput(p.DATA),
      DATA_FMT: formatarDataPt(p.DATA),
      HORARIO_CURTO: `${formatarHoraCurta(p.HORAINICIO)} – ${formatarHoraCurta(p.HORAFIM)}`,
      HORARIO_FORMATADO: formatarPeriodoPlantao(p.DATA, p.HORAINICIO, p.HORAFIM),
      FILIAL_NOME: limparNomeFilial(p.FILIAL_NOME_RAW) || String(p.CODFILIAL),
      SETOR_NOME: p.SETOR_NOME || p.CODCCUSTO,
      CRM_LISTA: crmLista,
      MEDICOS: medicos,
      MEDICO_NOME: medicos[0] ? medicos[0].nome : null,
      CONCLUSAO: statusConclusao(p),
      REGISTROS: regsDet,
      JUSTIFICATIVAS: justDet
    };
  });
}

function montarLinhasExportacao(plantoes) {
  const linhas = [];

  plantoes.forEach(p => {
    (p.MEDICOS || []).forEach(m => {
      const base = {
        idPlantao: p.IDPLANTAO,
        dataFmt: p.DATA_FMT,
        horario: p.HORARIO_CURTO,
        filial: p.FILIAL_NOME,
        codFilial: p.CODFILIAL,
        setor: p.SETOR_NOME,
        statusPlantao: p.STATUS,
        conclusao: m.CONCLUSAO ? m.CONCLUSAO.label : (p.CONCLUSAO ? p.CONCLUSAO.label : ""),
        crm: m.crm,
        medicoNome: m.nome
      };

      if ((m.REGISTROS || []).length || (m.JUSTIFICATIVAS || []).length) {
        (m.REGISTROS || []).forEach(r => {
          linhas.push({
            ...base,
            tipoEvento: "Registro de acesso",
            tipoDetalhe: r.tipoLabel,
            dataEvento: r.dataFmt,
            horaEvento: r.horaFmt,
            situacao: r.situacaoLabel,
            diffMin: r.diffMin != null ? r.diffMin : "",
            statusAprovacao: "",
            motivo: ""
          });
        });
        (m.JUSTIFICATIVAS || []).forEach(j => {
          linhas.push({
            ...base,
            tipoEvento: "Justificativa",
            tipoDetalhe: j.tipoLabel,
            dataEvento: j.dataFmt,
            horaEvento: j.horaFmt,
            situacao: j.situacaoLabel,
            diffMin: "",
            statusAprovacao: j.statusLabel,
            motivo: j.motivo
          });
        });
      } else {
        linhas.push({
          ...base,
          tipoEvento: "Sem ação registrada",
          tipoDetalhe: "—",
          dataEvento: "",
          horaEvento: "",
          situacao: String(p.STATUS || "").toUpperCase() === "CANCELADO" ? "Cancelado" : "Pendente de registro",
          diffMin: "",
          statusAprovacao: "",
          motivo: ""
        });
      }
    });
  });

  return linhas;
}

function resumirPlantoes(plantoes) {
  const resumo = {
    plantoes: plantoes.length,
    registrosDentroPrazo: 0,
    registrosForaPrazo: 0,
    justificativas: 0,
    justificativasPendentes: 0,
    justificativasAprovadas: 0,
    justificativasReprovadas: 0,
    semAcao: 0
  };

  plantoes.forEach(p => {
    let temAcao = false;
    (p.MEDICOS || []).forEach(m => {
      (m.REGISTROS || []).forEach(r => {
        temAcao = true;
        if (r.dentroDoPrazo) resumo.registrosDentroPrazo += 1;
        else resumo.registrosForaPrazo += 1;
      });
      (m.JUSTIFICATIVAS || []).forEach(j => {
        temAcao = true;
        resumo.justificativas += 1;
        if (j.situacao === "JUSTIFICATIVA_PENDENTE") resumo.justificativasPendentes += 1;
        if (j.situacao === "JUSTIFICATIVA_APROVADA") resumo.justificativasAprovadas += 1;
        if (j.situacao === "JUSTIFICATIVA_REPROVADA") resumo.justificativasReprovadas += 1;
      });
      if (!(m.REGISTROS || []).length && !(m.JUSTIFICATIVAS || []).length) {
        resumo.semAcao += 1;
      }
    });
    if (!temAcao && !(p.MEDICOS || []).length) resumo.semAcao += 1;
  });

  return resumo;
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
      ) AS QTD_JUST_APROVADAS,
      (
        SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j
        WHERE j.IDPLANTAO = e.IDPLANTAO AND j.STATUSAPROVACAO = 'PENDENTE'
      ) AS QTD_JUST_PENDENTES,
      (
        SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j
        WHERE j.IDPLANTAO = e.IDPLANTAO AND j.STATUSAPROVACAO = 'REPROVADO'
      ) AS QTD_JUST_REPROVADAS
    FROM ESCALAMEDICA e
    LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
    LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
    ${where}
    ORDER BY e.DATA DESC, e.HORAINICIO DESC, e.IDPLANTAO DESC
  `);

  const rows = plantoesResult.recordset;
  if (!rows.length) {
    return { plantoes: [], linhas: [], resumo: resumirPlantoes([]) };
  }

  const ids = rows.map(p => p.IDPLANTAO);
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
    ...rows.flatMap(p => parseCrmLista(p.CRM_ESCALADO)),
    ...registros.map(r => r.CRM),
    ...justificativas.map(j => j.CRM)
  ];
  const mapaNomes = await mapearNomesMedicos(crms);
  const plantoes = montarPlantoesRelatorio(rows, registros, justificativas, mapaNomes);
  const linhas = montarLinhasExportacao(plantoes);

  return {
    plantoes,
    linhas,
    resumo: resumirPlantoes(plantoes)
  };
}

async function gerarXlsx(linhas) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Escala Médica";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Relatório", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  sheet.columns = [
    { header: "ID Plantão", key: "idPlantao", width: 12 },
    { header: "Data plantão", key: "dataFmt", width: 14 },
    { header: "Horário", key: "horario", width: 16 },
    { header: "Filial", key: "filial", width: 28 },
    { header: "Cód. Filial", key: "codFilial", width: 12 },
    { header: "Setor", key: "setor", width: 22 },
    { header: "Status plantão", key: "statusPlantao", width: 22 },
    { header: "Conclusão", key: "conclusao", width: 26 },
    { header: "CRM", key: "crm", width: 14 },
    { header: "Médico", key: "medicoNome", width: 28 },
    { header: "Tipo evento", key: "tipoEvento", width: 20 },
    { header: "Detalhe", key: "tipoDetalhe", width: 28 },
    { header: "Data evento", key: "dataEvento", width: 14 },
    { header: "Hora evento", key: "horaEvento", width: 12 },
    { header: "Situação", key: "situacao", width: 24 },
    { header: "Diferença (min)", key: "diffMin", width: 14 },
    { header: "Status aprovação", key: "statusAprovacao", width: 18 },
    { header: "Motivo", key: "motivo", width: 40 }
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };

  linhas.forEach(l => {
    sheet.addRow({
      idPlantao: l.idPlantao,
      dataFmt: l.dataFmt,
      horario: l.horario,
      filial: l.filial,
      codFilial: l.codFilial,
      setor: l.setor,
      statusPlantao: l.statusPlantao,
      conclusao: l.conclusao,
      crm: l.crm,
      medicoNome: l.medicoNome,
      tipoEvento: l.tipoEvento,
      tipoDetalhe: l.tipoDetalhe,
      dataEvento: l.dataEvento,
      horaEvento: l.horaEvento,
      situacao: l.situacao,
      diffMin: l.diffMin,
      statusAprovacao: l.statusAprovacao,
      motivo: l.motivo
    });
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  listarCompleto,
  gerarXlsx,
  classificarRegistro,
  TOLERANCIA_MIN
};
