const express = require("express");
const router = express.Router();
const registroController = require("../controllers/registroAcesso.controller");
const { exigirPerfil } = require("../middlewares/perfil.middleware");

router.use(exigirPerfil("MEDICO"));

router.get("/", registroController.index);
router.post("/:id/bater", registroController.bater);

module.exports = router;
