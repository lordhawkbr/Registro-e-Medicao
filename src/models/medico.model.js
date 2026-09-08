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
      FROM Corporerm.dbo.ZMDMEDICOSPJ
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
    crm: `${String(medico.CRM).trim()}${String(medico.UFCRM).trim().toUpperCase()}`,
    nome: medico.NOMECOMPLETO.trim()
  };
}

// Médicos ativos da filial + especialidade (para escala)
async function listarPorFilialEspecialidade(codFilial, especialidade) {
  const pool = await getPool();
  const request = pool.request()
    .input("codFilial", sql.Int, codFilial);

  let whereEsp = "";
  if (especialidade != null && String(especialidade).trim() !== "") {
    request.input("especialidade", sql.VarChar, String(especialidade).trim());
    whereEsp = "AND LTRIM(RTRIM(CAST(ESPECIALIDADE AS VARCHAR(200)))) = @especialidade";
  }

  const result = await request.query(`
    SELECT CODFILIAL, NOMECOMPLETO, ESPECIALIDADE, CRM, UFCRM
    FROM Corporerm.dbo.ZMDMEDICOSPJ
    WHERE ATIVO = 'SIM'
      AND CODFILIAL = @codFilial
      ${whereEsp}
    ORDER BY CODFILIAL, NOMECOMPLETO
  `);

  return result.recordset.map(m => ({
    codFilial: m.CODFILIAL,
    nomeCompleto: String(m.NOMECOMPLETO || "").trim(),
    especialidade: m.ESPECIALIDADE,
    crm: String(m.CRM || "").trim(),
    ufCrm: String(m.UFCRM || "").trim().toUpperCase()
  }));
}

module.exports = { autenticar, listarPorFilialEspecialidade };
