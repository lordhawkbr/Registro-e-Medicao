require("dotenv").config();
const express = require("express");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");
const methodOverride = require("method-override");
const session = require("express-session");

const escalaRoutes = require("./routes/escala.routes");
const authRoutes = require("./routes/auth.routes");
const registroAcessoRoutes = require("./routes/registroAcesso.routes");
const justificativaRoutes = require("./routes/justificativa.routes");
const painelRoutes = require("./routes/painel.routes");
const referenciaRoutes = require("./routes/referencia.routes");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "partials/layout");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "escala-medica-dev-secret",
  resave: false,
  saveUninitialized: false
}));

app.get("/", (req, res) => res.redirect("/login"));
app.use("/", authRoutes);
app.use("/escala", escalaRoutes);
app.use("/registro-acesso", registroAcessoRoutes);
app.use("/justificativa", justificativaRoutes);
app.use("/painel", painelRoutes);
app.use("/api", referenciaRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(`Erro: ${err.message}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
