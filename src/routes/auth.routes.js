const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.get("/login", authController.loginForm);
router.post("/login/medico", authController.loginMedico);
router.post("/login/admin", authController.loginAdmin);
router.post("/logout", authController.logout);

module.exports = router;
