const express = require("express");
const router = express.Router();
const justificativaController = require("../controllers/justificativa.controller");
const { exigirPerfil } = require("../middlewares/perfil.middleware");

// Medico cria e ve as suas
router.get("/", exigirPerfil("MEDICO"), justificativaController.index);
router.get("/novo", exigirPerfil("MEDICO"), justificativaController.novo);
router.post("/", exigirPerfil("MEDICO"), justificativaController.criar);

// Admin/Administrativo aprova
router.get("/pendentes", exigirPerfil("ADMIN", "ADMINISTRATIVO"), justificativaController.pendentes);
router.post("/:id/decisao", exigirPerfil("ADMIN", "ADMINISTRATIVO"), justificativaController.aprovar);

module.exports = router;
