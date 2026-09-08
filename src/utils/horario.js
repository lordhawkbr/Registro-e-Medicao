const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado"
];

// mssql retorna colunas TIME como Date (1970-01-01 UTC) em vez de string "HH:MM"
function extrairHoraMinuto(valor) {
  if (valor == null || valor === "") return { h: 0, m: 0 };
  if (valor instanceof Date) {
    return { h: valor.getUTCHours(), m: valor.getUTCMinutes() };
  }
  const partes = String(valor).split(":");
  return { h: Number(partes[0]) || 0, m: Number(partes[1]) || 0 };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatarHoraCurta(valor) {
  const { h, m } = extrairHoraMinuto(valor);
  return m === 0 ? `${pad2(h)}h` : `${pad2(h)}h${pad2(m)}`;
}

function formatarHoraInput(valor) {
  if (valor == null || valor === "") return "";
  const { h, m } = extrairHoraMinuto(valor);
  return `${pad2(h)}:${pad2(m)}`;
}

function parseDataLocal(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    // Colunas DATE do mssql chegam como meia-noite UTC; usar ISO evita virar dia anterior no BR
    const [y, m, d] = valor.toISOString().slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const str = String(valor).slice(0, 10);
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatarDataInput(valor) {
  if (!valor) return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const d = parseDataLocal(valor);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatarDataPt(valor) {
  const d = parseDataLocal(valor);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function diaSemana(valor) {
  const d = parseDataLocal(valor);
  if (!d) return "";
  return DIAS_SEMANA[d.getDay()];
}

function adicionarDias(data, dias) {
  const d = parseDataLocal(data);
  if (!d) return null;
  d.setDate(d.getDate() + dias);
  return d;
}

function montarDateTimePlantao(data, hora) {
  const base = parseDataLocal(data);
  if (!base) return null;
  const { h, m } = extrairHoraMinuto(hora);
  base.setHours(h, m, 0, 0);
  return base;
}

function dataFimPlantao(data, horaInicio, horaFim) {
  const inicio = extrairHoraMinuto(horaInicio);
  const fim = extrairHoraMinuto(horaFim);
  let dataFim = parseDataLocal(data);
  if (!dataFim) return null;
  if (fim.h < inicio.h || (fim.h === inicio.h && fim.m < inicio.m)) {
    dataFim = adicionarDias(dataFim, 1);
  }
  return dataFim;
}

// Ex.: Início: Terça 01/01/1970 - 07h às Terça 01/01/1970 - 19h
function formatarPeriodoPlantao(data, horaInicio, horaFim) {
  const dataInicio = parseDataLocal(data);
  const dataFim = dataFimPlantao(data, horaInicio, horaFim);
  if (!dataInicio || !dataFim) {
    return `${formatarHoraCurta(horaInicio)} - ${formatarHoraCurta(horaFim)}`;
  }
  const ini = `${diaSemana(dataInicio)} ${formatarDataPt(dataInicio)} - ${formatarHoraCurta(horaInicio)}`;
  const fim = `${diaSemana(dataFim)} ${formatarDataPt(dataFim)} - ${formatarHoraCurta(horaFim)}`;
  return `Início: ${ini} às ${fim}`;
}

function chaveData(valor) {
  return formatarDataInput(valor);
}

function minutosDesdeMeiaNoite(hora) {
  const { h, m } = extrairHoraMinuto(hora);
  return h * 60 + m;
}

function intervaloPlantaoMs(data, horaInicio, horaFim) {
  const inicio = montarDateTimePlantao(data, horaInicio);
  const fimData = dataFimPlantao(data, horaInicio, horaFim);
  const fim = montarDateTimePlantao(fimData, horaFim);
  if (!inicio || !fim) return null;
  return { inicio: inicio.getTime(), fim: fim.getTime() };
}

function horariosSobrepostos(dataA, iniA, fimA, dataB, iniB, fimB) {
  const a = intervaloPlantaoMs(dataA, iniA, fimA);
  const b = intervaloPlantaoMs(dataB, iniB, fimB);
  if (!a || !b) return false;
  return a.inicio < b.fim && b.inicio < a.fim;
}

module.exports = {
  extrairHoraMinuto,
  formatarHoraCurta,
  formatarHoraInput,
  formatarDataInput,
  formatarDataPt,
  diaSemana,
  montarDateTimePlantao,
  dataFimPlantao,
  formatarPeriodoPlantao,
  chaveData,
  minutosDesdeMeiaNoite,
  intervaloPlantaoMs,
  horariosSobrepostos,
  DIAS_SEMANA
};
