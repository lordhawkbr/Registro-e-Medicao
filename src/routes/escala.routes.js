const express = require("express");
const router = express.Router();
const escalaController = require("../controllers/escala.controller");
const { exigirPerfil } = require("../middlewares/perfil.middleware");

router.use(exigirPerfil("ADMIN", "ADMINISTRATIVO"));

router.get("/", escalaController.index);
router.get("/calendario", escalaController.calendario);
router.get("/novo", escalaController.novo);
router.post("/", escalaController.criar);
router.get("/:id/editar", escalaController.editar);
router.put("/:id", escalaController.atualizar);
router.delete("/:id", escalaController.cancelar);

module.exports = router;
