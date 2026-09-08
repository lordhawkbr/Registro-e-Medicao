const SEPARADOR = "|";

function parseCrmLista(valor) {
  if (Array.isArray(valor)) {
    return valor.map(v => String(v || "").trim()).filter(Boolean).slice(0, 3);
  }
  return String(valor || "")
    .split(/[|,;]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function juntarCrmLista(lista) {
  const unicos = [];
  parseCrmLista(lista).forEach(crm => {
    const key = crm.toUpperCase();
    if (!unicos.some(u => u.toUpperCase() === key)) unicos.push(crm);
  });
  if (!unicos.length) throw new Error("Selecione ao menos um médico.");
  if (unicos.length > 3) throw new Error("São permitidos no máximo 3 médicos por plantão.");
  return unicos.join(SEPARADOR);
}

function crmPertenceAoPlantao(crmEscalado, crm) {
  const alvo = String(crm || "").trim().toUpperCase();
  if (!alvo) return false;
  return parseCrmLista(crmEscalado).some(c => c.toUpperCase() === alvo);
}

function sqlFiltroCrmEscalado(alias = "e") {
  return `(
    ${alias}.CRM_ESCALADO = @crm
    OR ${alias}.CRM_ESCALADO LIKE @crm + '|%'
    OR ${alias}.CRM_ESCALADO LIKE '%|' + @crm + '|%'
    OR ${alias}.CRM_ESCALADO LIKE '%|' + @crm
  )`;
}

function montarCrmEscalado(dados) {
  if (dados.crmEscalado1 || dados.crmEscalado2 || dados.crmEscalado3) {
    return juntarCrmLista([dados.crmEscalado1, dados.crmEscalado2, dados.crmEscalado3]);
  }
  const bruto = String(dados.crmEscalado || dados.crm || "").trim();
  if (!bruto) throw new Error("Selecione ao menos um médico.");
  if (bruto.includes("|") || bruto.includes(",")) return juntarCrmLista(bruto);

  const uf = String(dados.ufCrm || dados.ufcrm || "").trim().toUpperCase();
  if (uf && !bruto.toUpperCase().endsWith(uf)) return juntarCrmLista(`${bruto}${uf}`);
  return juntarCrmLista(bruto);
}

module.exports = {
  SEPARADOR,
  parseCrmLista,
  juntarCrmLista,
  crmPertenceAoPlantao,
  sqlFiltroCrmEscalado,
  montarCrmEscalado
};
