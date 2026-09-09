/**
 * Servidor de preview do calendário admin (sem banco).
 * Uso: node scripts/previewCalendario.js
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");
const {
  montarCalendarioAdmin,
  estatisticasCalendario,
  categoriasDoMes,
  STATUS_CALENDARIO,
  statusCalendario
} = require("../src/utils/calendario");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "src", "views"));
app.use(expressLayouts);
app.set("layout", "partials/layout");
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res, next) => {
  res.locals.sessionTipo = "ADMIN";
  res.locals.sessionNome = "Preview";
  res.locals.adminNav = "calendario";
  next();
});

function mockPlantoes(mes) {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const hoje = "2026-09-08";
  const plantoes = [];
  for (let d = 1; d <= ultimo; d++) {
    const n = d % 5 === 0 ? 5 : d % 3 === 0 ? 3 : d % 2 === 0 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const data = `${mes}-${String(d).padStart(2, "0")}`;
      const codigos = ["PENDENTE_ENTRADA", "REGISTRADO", "PENDENTE_SAIDA", "CANCELADO", "JUSTIFICADO"];
      let codigo = codigos[(d + i) % codigos.length];
      if (data < hoje && i === 0 && d % 7 === 0) codigo = "PENDENTE_ENTRADA";
      const p = {
        IDPLANTAO: d * 10 + i,
        DATA_INPUT: data,
        HORAINICIO_INPUT: `${String(7 + i * 3).padStart(2, "0")}:00`,
        HORARIO_CURTO: `${7 + i * 3}h – ${11 + i * 3}h`,
        MEDICO_NOME: ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Nunes"][i % 4],
        ESPECIALIDADE_CODIGO: String(10 + (i % 3)),
        ESPECIALIDADE_NOME: ["Clínica", "Cirurgia", "Pediatria"][i % 3],
        FILIAL_NOME: "Hospital Central",
        CONCLUSAO: { codigo },
        PODE_EDITAR: codigo === "PENDENTE_ENTRADA"
      };
      p.STATUS_CAL = statusCalendario(p, hoje);
      plantoes.push(p);
    }
  }
  return plantoes;
}

app.get("/", (req, res) => res.redirect("/escala/calendario"));
app.get("/escala", (req, res) => res.redirect("/escala/calendario"));
app.get("/escala/calendario", (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || "")) ? req.query.mes : "2026-09";
  let plantoes = mockPlantoes(mes);
  const categorias = categoriasDoMes(plantoes);
  if (req.query.categoria) {
    plantoes = plantoes.filter(p => String(p.ESPECIALIDADE_CODIGO) === String(req.query.categoria));
  }
  if (req.query.statusCal) {
    plantoes = plantoes.filter(p => p.STATUS_CAL.key === req.query.statusCal);
  }
  const calendario = montarCalendarioAdmin(plantoes, mes, { maxVisiveis: 3 });
  const porDiaJson = {};
  Object.entries(calendario.porDia || {}).forEach(([chave, lista]) => {
    porDiaJson[chave] = (lista || []).map(ev => ({
      IDPLANTAO: ev.IDPLANTAO,
      TITULO_CAL: ev.TITULO_CAL,
      PODE_EDITAR: !!ev.PODE_EDITAR,
      STATUS_CAL: ev.STATUS_CAL
    }));
  });
  res.render("escala/calendario", {
    calendario,
    porDiaJson,
    filtros: {
      mes,
      codFilial: req.query.codFilial || "",
      categoria: req.query.categoria || "",
      statusCal: req.query.statusCal || ""
    },
    filiais: [
      { codFilial: 1, nome: "Hospital Central" },
      { codFilial: 2, nome: "Unidade Norte" }
    ],
    categorias,
    stats: estatisticasCalendario(plantoes, 1284, "2026-09-08"),
    statusLegenda: Object.values(STATUS_CALENDARIO),
    containerClass: "container-lista container-calendario",
    adminNav: "calendario"
  });
});

app.get("/escala/novo", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Novo plantão</title>
    <link rel="stylesheet" href="/css/style.css"></head>
    <body class="body-admin"><main class="container container-form"><div class="form-page">
    <h1>Novo plantão</h1>
    <p>Data pré-preenchida: <strong>${req.query.data || "(não informada)"}</strong></p>
    <p>Origem: <strong>${req.query.origem || "-"}</strong></p>
    <p class="muted">Preview sem banco — o formulário completo usa /escala/novo na aplicação real.</p>
    <a class="btn" href="/escala/calendario?mes=${String(req.query.data || "2026-09-08").slice(0, 7)}">Voltar ao calendário</a>
    </div></main></body></html>`);
});

app.get("/justificativa/pendentes", (req, res) => res.send("Justificativas (preview)"));
app.get("/relatorio", (req, res) => res.send("Relatório (preview)"));
app.get("/logout", (req, res) => res.redirect("/escala/calendario"));
app.post("/logout", (req, res) => res.redirect("/escala/calendario"));

const PORT = process.env.PREVIEW_PORT || 3010;
app.listen(PORT, () => console.log(`Preview calendário em http://localhost:${PORT}/escala/calendario`));
