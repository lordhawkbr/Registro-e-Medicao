const sql = require("mssql");

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Banco do Fluig, onde vive FDN_USERTENANT (login administrativo)
const configFluig = {
  user: process.env.FLUIG_DB_USER || process.env.DB_USER,
  password: process.env.FLUIG_DB_PASSWORD || process.env.DB_PASSWORD,
  server: process.env.FLUIG_DB_SERVER || process.env.DB_SERVER,
  database: process.env.FLUIG_DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;
let poolFluigPromise;
let schemaReadyPromise;

async function ensureEscalaSchema(pool) {
  // Amplia CRM_ESCALADO para caber até 3 médicos (CRM+UF|...). Produção pode ainda estar em VARCHAR(20).
  await pool.request().query(`
    IF COL_LENGTH('dbo.ESCALAMEDICA', 'CRM_ESCALADO') IS NOT NULL
       AND COL_LENGTH('dbo.ESCALAMEDICA', 'CRM_ESCALADO') < 200
    BEGIN
      ALTER TABLE dbo.ESCALAMEDICA ALTER COLUMN CRM_ESCALADO VARCHAR(200) NOT NULL;
    END
  `);
}

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(async pool => {
        console.log("Conectado ao SQL Server (banco principal)");
        if (!schemaReadyPromise) {
          schemaReadyPromise = ensureEscalaSchema(pool)
            .then(() => console.log("Schema ESCALAMEDICA verificado (CRM_ESCALADO)"))
            .catch(err => {
              schemaReadyPromise = null;
              console.error("Falha ao ajustar CRM_ESCALADO:", err.message);
            });
        }
        await schemaReadyPromise;
        return pool;
      })
      .catch(err => {
        poolPromise = null;
        console.error("Erro ao conectar no banco principal:", err.message);
        throw err;
      });
  }
  return poolPromise;
}

function getPoolFluig() {
  if (!poolFluigPromise) {
    poolFluigPromise = new sql.ConnectionPool(configFluig)
      .connect()
      .then(pool => {
        console.log("Conectado ao SQL Server (banco Fluig)");
        return pool;
      })
      .catch(err => {
        poolFluigPromise = null;
        console.error("Erro ao conectar no banco Fluig:", err.message);
        throw err;
      });
  }
  return poolFluigPromise;
}

module.exports = { sql, getPool, getPoolFluig, ensureEscalaSchema };
