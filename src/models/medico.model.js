const { sql, getPool } = require("../config/db");

// Login: CRM + UF + CPF (apenas números) contra o cadastro existente ZMDMEDICOSPJ
async function autenticar(crm, crmUf, cpf) {
  const pool = await getPool();
  const cpfLimpo = String(cpf).replace(/\D/g, "");

  const result = await pool.request()
    .input("crm", sql.VarChar, crm.trim())
    .input("crmUf", sql.VarChar, crmUf.trim().toUpperCase())
    .query(`
      SELECT NOMECOMPLETO, CRM, UFCRM, CPF, ATIVO
      FROM ZMDMEDICOSPJ
      WHERE LTRIM(RTRIM(CRM)) = @crm AND LTRIM(RTRIM(UFCRM)) = @crmUf
    `);

  const medico = result.recordset[0];
  if (!medico) return { erro: "CRM, UF ou CPF inválidos." };

  const cpfCadastrado = String(medico.CPF).replace(/\D/g, "");
  if (cpfCadastrado !== cpfLimpo) return { erro: "CRM, UF ou CPF inválidos." };
  if (String(medico.ATIVO).trim().toUpperCase() !== "SIM") {
    return { erro: "Cadastro inativo. Procure a coordenação da unidade." };
  }

  return {
    crm: `${medico.CRM}${medico.UFCRM}`,
    nome: medico.NOMECOMPLETO.trim()
  };
}

module.exports = { autenticar };
