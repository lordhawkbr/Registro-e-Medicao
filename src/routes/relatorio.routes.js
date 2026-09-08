const express = require("express");
const router = express.Router();
const relatorioController = require("../controllers/relatorio.controller");
const { exigirPerfil } = require("../middlewares/perfil.middleware");

router.use(exigirPerfil("ADMIN", "ADMINISTRATIVO"));

router.get("/", relatorioController.index);
router.get("/exportar", relatorioController.exportar);

module.exports = router;
