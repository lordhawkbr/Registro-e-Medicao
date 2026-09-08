-- Amplia CRM_ESCALADO para permitir até 3 médicos (CRM+UF separados por |)
-- Produção pode ainda estar em VARCHAR(20); use ao menos 200.
IF COL_LENGTH('dbo.ESCALAMEDICA', 'CRM_ESCALADO') IS NOT NULL
BEGIN
  ALTER TABLE dbo.ESCALAMEDICA ALTER COLUMN CRM_ESCALADO VARCHAR(200) NOT NULL;
END
GO
