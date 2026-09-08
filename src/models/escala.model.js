const { sql, getPool } = require("../config/db");
const {
  extrairHoraMinuto,
  formatarPeriodoPlantao,
  formatarHoraInput,
  formatarDataInput,
  formatarHoraCurta,
  formatarDataPt,
  horariosSobrepostos
} = require("../utils/horario");
const { statusConclusao, podeEditarOuCancelar, limparNomeFilial } = require("../utils/statusPlantao");

const SELECT_PLANTAO_ENRIQUECIDO = `
  SELECT
    e.*,
    f.NOMEFANTASIA AS FILIAL_NOME_RAW,
    c.NOME AS SETOR_NOME,
    t.DESCRICAO AS TIPO_DESCRICAO,
    t.TURNO AS TIPO_TURNO,
    t.TIPO AS TIPO_TURNO_TIPO,
    m.NOMECOMPLETO AS MEDICO_NOME,
    (
      SELECT COUNT(*) FROM REGISTROACESSO r WHERE r.IDPLANTAO = e.IDPLANTAO
    ) AS QTD_REGISTROS,
    (
      SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j WHERE j.IDPLANTAO = e.IDPLANTAO
    ) AS QTD_JUSTIFICATIVAS,
    (
      SELECT COUNT(*) FROM JUSTIFICATIVAAUSENCIA j
      WHERE j.IDPLANTAO = e.IDPLANTAO AND j.STATUSAPROVACAO = 'APROVADO'
    ) AS QTD_JUST_APROVADAS
  FROM ESCALAMEDICA e
  LEFT JOIN GFILIAL f ON f.CODFILIAL = e.CODFILIAL
  LEFT JOIN GCCUSTO c ON c.CODCCUSTO = e.CODCCUSTO
  LEFT JOIN ZMDTIPOPLANTAOMEDICO2 t ON t.ID = e.CODTIPOPLANTAO
  LEFT JOIN ZMDMEDICOSPJ m
    ON LTRIM(RTRIM(CAST(m.CRM AS VARCHAR(20)))) + LTRIM(RTRIM(CAST(m.UFCRM AS VARCHAR(5)))) = e.CRM_ESCALADO
`;

function normalizarPlantao(row) {
  if (!row) return row;
  const conclusao = statusConclusao(row);
  return {
    ...row,
    DATA_INPUT: formatarDataInput(row.DATA),
    HORAINICIO_INPUT: formatarHoraInput(row.HORAINICIO),
    HORAFIM_INPUT: formatarHoraInput(row.HORAFIM),
    HORARIO_FORMATADO: formatarPeriodoPlantao(row.DATA, row.HORAINICIO, row.HORAFIM),
    FILIAL_NOME: limparNomeFilial(row.FILIAL_NOME_RAW) || String(row.CODFILIAL),
    SETOR_NOME: row.SETOR_NOME || row.CODCCUSTO,
    TIPO_NOME: row.TIPO_DESCRICAO
      ? `${row.TIPO_DESCRICAO}${row.TIPO_TURNO ? ` (${row.TIPO_TURNO}${row.TIPO_TURNO_TIPO ? "/" + row.TIPO_TURNO_TIPO : ""})` : ""}`
      : (row.CODTIPOPLANTAO != null ? `Tipo #${row.CODTIPOPLANTAO}` : ""),
    MEDICO_NOME: row.MEDICO_NOME ? String(row.MEDICO_NOME).trim() : null,
    CONCLUSAO: conclusao,
    PODE_EDITAR: podeEditarOuCancelar(row)
  };
}

async function listar(filtros = {}) {
  const pool = await getPool();
  const request = pool.request();
  let where = "WHERE 1=1";

  if (filtros.data) {
    request.input("data", sql.Date, filtros.data);
    where += " AND e.DATA = @data";
  }
  if (filtros.codFilial) {
    request.input("codFilial", sql.Int, filtros.codFilial);
    where += " AND e.CODFILIAL = @codFilial";
  }
  if (filtros.status) {
    request.input("status", sql.VarChar, filtros.status);
    where += " AND e.STATUS = @status";
  }

  const result = await request.query(`
    ${SELECT_PLANTAO_ENRIQUECIDO}
    ${where}
    ORDER BY e.DATA DESC, e.HORAINICIO DESC
  `);
  return result.recordset.map(normalizarPlantao);
}

async function buscarPorId(idPlantao) {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, idPlantao)
    .query(`
      ${SELECT_PLANTAO_ENRIQUECIDO}
      WHERE e.IDPLANTAO = @id
    `);
  return normalizarPlantao(result.recordset[0]);
}

async function criar(dados, usuario) {
  const crmEscalado = montarCrmEscalado(dados);
  await garantirSemConflito({
    crmEscalado,
    data: dados.data,
    horaInicio: dados.horaInicio,
    horaFim: dados.horaFim
  });

  const pool = await getPool();
  const dataExpiracao = calcularDataExpiracao(dados.data, dados.horaFim);
  const empresa = resolverEmpresa(dados);

  const result = await pool.request()
    .input("codFilial", sql.Int, dados.codFilial)
    .input("empresa", sql.Int, empresa)
    .input("codCCusto", sql.VarChar, dados.codCCusto)
    .input("data", sql.Date, dados.data)
    .input("horaInicio", sql.VarChar, dados.horaInicio)
    .input("horaFim", sql.VarChar, dados.horaFim)
    .input("idEspecialidade", sql.Int, parseIdEspecialidade(dados.idEspecialidade || dados.especialidade))
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar, crmEscalado)
    .input("dataExpiracao", sql.DateTime, dataExpiracao)
    .input("criadoPor", sql.VarChar, usuario)
    .query(`
      INSERT INTO ESCALAMEDICA
        (CODFILIAL, EMPRESA, CODCCUSTO, DATA, HORAINICIO, HORAFIM,
         IDESPECIALIDADE, CODTIPOPLANTAO, CRM_ESCALADO, STATUS, DATAEXPIRACAO, RECCREATEDBY)
      OUTPUT INSERTED.IDPLANTAO
      VALUES
        (@codFilial, @empresa, @codCCusto, @data, @horaInicio, @horaFim,
         @idEspecialidade, @codTipoPlantao, @crmEscalado, 'ABERTO', @dataExpiracao, @criadoPor)
    `);
  return result.recordset[0].IDPLANTAO;
}

async function atualizar(idPlantao, dados) {
  const atual = await buscarPorId(idPlantao);
  if (!atual) throw new Error("Plantão não encontrado");
  if (!atual.PODE_EDITAR) {
    throw new Error("Este plantão já teve ação do médico e não pode mais ser editado.");
  }

  const crmEscalado = montarCrmEscalado(dados);
  await garantirSemConflito({
    crmEscalado,
    data: dados.data,
    horaInicio: dados.horaInicio,
    horaFim: dados.horaFim,
    excluirId: idPlantao
  });

  const pool = await getPool();
  const dataExpiracao = calcularDataExpiracao(dados.data, dados.horaFim);
  const empresa = resolverEmpresa(dados);

  await pool.request()
    .input("id", sql.Int, idPlantao)
    .input("codFilial", sql.Int, dados.codFilial)
    .input("empresa", sql.Int, empresa)
    .input("codCCusto", sql.VarChar, dados.codCCusto)
    .input("data", sql.Date, dados.data)
    .input("horaInicio", sql.VarChar, dados.horaInicio)
    .input("horaFim", sql.VarChar, dados.horaFim)
    .input("idEspecialidade", sql.Int, parseIdEspecialidade(dados.idEspecialidade || dados.especialidade))
    .input("codTipoPlantao", sql.Int, dados.codTipoPlantao)
    .input("crmEscalado", sql.VarChar, crmEscalado)
    .input("dataExpiracao", sql.DateTime, dataExpiracao)
    .query(`
      UPDATE ESCALAMEDICA SET
        CODFILIAL = @codFilial, EMPRESA = @empresa, CODCCUSTO = @codCCusto,
        DATA = @data, HORAINICIO = @horaInicio, HORAFIM = @horaFim,
        IDESPECIALIDADE = @idEspecialidade, CODTIPOPLANTAO = @codTipoPlantao,
        CRM_ESCALADO = @crmEscalado, DATAEXPIRACAO = @dataExpiracao
      WHERE IDPLANTAO = @id
    `);
}

function resolverEmpresa(dados) {
  const valor = dados.empresa != null && dados.empresa !== ""
    ? dados.empresa
    : dados.codFilial;
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n)) {
    throw new Error("Empresa/filial inválida para gravação do plantão.");
  }
  return n;
}

async function buscarConflitosHorario({ crmEscalado, data, horaInicio, horaFim, excluirId = null }) {
  const pool = await getPool();
  const request = pool.request()
    .input("crm", sql.VarChar, crmEscalado)
    .input("data", sql.Date, data);

  let whereExtra = "";
  if (excluirId) {
    request.input("excluirId", sql.Int, excluirId);
    whereExtra = "AND e.IDPLANTAO <> @excluirId";
  }

  // Busca plantões do médico no dia anterior, atual e seguinte (virada de turno)
  const result = await request.query(`
    SELECT e.IDPLANTAO, e.DATA, e.HORAINICIO, e.HORAFIM, e.STATUS, e.CODFILIAL, e.CODCCUSTO
    FROM ESCALAMEDICA e
    WHERE e.CRM_ESCALADO = @crm
      AND e.STATUS <> 'CANCELADO'
      AND CAST(e.DATA AS DATE) BETWEEN DATEADD(day, -1, @data) AND DATEADD(day, 1, @data)
      ${whereExtra}
  `);

  return result.recordset.filter(p =>
    horariosSobrepostos(data, horaInicio, horaFim, p.DATA, p.HORAINICIO, p.HORAFIM)
  );
}

async function garantirSemConflito(opts) {
  const conflitos = await buscarConflitosHorario(opts);
  if (!conflitos.length) return;

  const detalhe = conflitos.map(p => {
    const data = formatarDataPt(p.DATA);
    const ini = formatarHoraCurta(p.HORAINICIO);
    const fim = formatarHoraCurta(p.HORAFIM);
    return `#${p.IDPLANTAO} (${data} ${ini}-${fim})`;
  }).join(", ");

  throw new Error(
    `Este médico já possui plantão no mesmo horário: ${detalhe}. Escolha outro horário ou outro médico.`
  );
}

function parseIdEspecialidade(valor) {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? n : 0;
}

function montarCrmEscalado(dados) {
  const crm = String(dados.crmEscalado || dados.crm || "").trim();
  const uf = String(dados.ufCrm || dados.ufcrm || "").trim().toUpperCase();
  if (uf && !crm.toUpperCase().endsWith(uf)) return `${crm}${uf}`;
  return crm;
}

async function cancelar(idPlantao) {
  const atual = await buscarPorId(idPlantao);
  if (!atual) throw new Error("Plantão não encontrado");
  if (!atual.PODE_EDITAR) {
    throw new Error("Este plantão já teve ação do médico e não pode mais ser cancelado.");
  }

  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, idPlantao)
    .query("UPDATE ESCALAMEDICA SET STATUS = 'CANCELADO' WHERE IDPLANTAO = @id");
}

function calcularDataExpiracao(data, horaFim) {
  const { h, m } = extrairHoraMinuto(horaFim);
  const base = new Date(data);
  base.setHours(h, m + 15, 0, 0);
  base.setDate(base.getDate() + 30);
  return base;
}

module.exports = { listar, buscarPorId, criar, atualizar, cancelar, normalizarPlantao };
