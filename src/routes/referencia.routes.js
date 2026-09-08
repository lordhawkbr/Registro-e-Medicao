const express = require("express");
const router = express.Router();
const referenciaController = require("../controllers/referencia.controller");
const { exigirPerfil } = require("../middlewares/perfil.middleware");

router.use(exigirPerfil("ADMIN", "ADMINISTRATIVO"));

router.get("/empresa/:codFilial", referenciaController.empresaPorFilial);
router.get("/setores/:codFilial", referenciaController.setoresPorFilial);
router.get("/tipos-plantao", referenciaController.tiposPlantao);
router.get("/medicos", referenciaController.medicos);

module.exports = router;
