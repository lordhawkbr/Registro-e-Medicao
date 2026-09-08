const express = require("express");
const router = express.Router();
const painelController = require("../controllers/painel.controller");
const { exigirPerfil } = require("../middlewares/perfil.middleware");

router.use(exigirPerfil("MEDICO"));
router.get("/", painelController.index);

module.exports = router;
