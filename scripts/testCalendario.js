const {
  statusCalendario,
  montarCalendarioAdmin,
  estatisticasCalendario,
  categoriasDoMes,
  STATUS_CALENDARIO
} = require("../src/utils/calendario");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const hoje = "2026-09-08";

assert(statusCalendario({ CONCLUSAO: { codigo: "CANCELADO" } }, hoje).key === "cancelado", "cancelado");
assert(statusCalendario({ CONCLUSAO: { codigo: "REGISTRADO" } }, hoje).key === "realizado", "realizado");
assert(statusCalendario({ CONCLUSAO: { codigo: "JUSTIFICADO" } }, hoje).key === "realizado", "justificado");
assert(
  statusCalendario({ CONCLUSAO: { codigo: "PENDENTE_ENTRADA" }, DATA_INPUT: "2026-09-10" }, hoje).key === "pendente",
  "futuro pendente"
);
assert(
  statusCalendario({ CONCLUSAO: { codigo: "PENDENTE_ENTRADA" }, DATA_INPUT: "2026-09-01" }, hoje).key === "nao_realizado",
  "passado nao realizado"
);

const plantoes = [
  {
    IDPLANTAO: 1,
    DATA_INPUT: "2026-09-08",
    HORAINICIO_INPUT: "07:00",
    HORARIO_CURTO: "07h – 19h",
    MEDICO_NOME: "Dr. A",
    ESPECIALIDADE_CODIGO: "10",
    ESPECIALIDADE_NOME: "Clínica",
    CONCLUSAO: { codigo: "PENDENTE_ENTRADA" },
    PODE_EDITAR: true
  },
  {
    IDPLANTAO: 2,
    DATA_INPUT: "2026-09-08",
    HORAINICIO_INPUT: "19:00",
    HORARIO_CURTO: "19h – 07h",
    MEDICO_NOME: "Dr. B",
    ESPECIALIDADE_CODIGO: "20",
    ESPECIALIDADE_NOME: "Cirurgia",
    CONCLUSAO: { codigo: "REGISTRADO" },
    PODE_EDITAR: false
  },
  {
    IDPLANTAO: 3,
    DATA_INPUT: "2026-09-01",
    HORAINICIO_INPUT: "07:00",
    HORARIO_CURTO: "07h – 19h",
    MEDICO_NOME: "Dr. C",
    ESPECIALIDADE_CODIGO: "10",
    ESPECIALIDADE_NOME: "Clínica",
    CONCLUSAO: { codigo: "PENDENTE_ENTRADA" },
    PODE_EDITAR: true
  }
];

const cal = montarCalendarioAdmin(plantoes, "2026-09", { maxVisiveis: 1 });
assert(cal.mesAtual === "2026-09", "mesAtual");
assert(cal.mesAnterior === "2026-08", "mesAnterior");
assert(cal.mesProximo === "2026-10", "mesProximo");
assert(cal.diasSemana[0] === "dom.", "dow");

const dia8 = cal.dias.find(d => d.chave === "2026-09-08");
assert(dia8 && dia8.qtd === 2, "dia 8 qtd");
assert(dia8.eventos.length === 1, "max visiveis");
assert(dia8.ocultos === 1, "ocultos");
assert(dia8.eventos[0].STATUS_CAL.key === "pendente", "ordem horario");

const stats = estatisticasCalendario(plantoes, 99, hoje);
assert(stats.total === 99, "total");
assert(stats.esteMes === 3, "esteMes");
assert(stats.concluidos === 1, "concluidos");
assert(stats.pendentes === 1, "pendentes");
assert(stats.naoRealizados === 1, "naoRealizados");

const cats = categoriasDoMes(plantoes);
assert(cats.length === 2, "categorias");
assert(Object.keys(STATUS_CALENDARIO).length === 4, "legenda");

console.log("OK calendario utils");
