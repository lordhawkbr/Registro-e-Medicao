-- ============================================================
-- RESET DE DADOS DE TESTE — Escala Médica
--
-- Apaga plantões, batidas, justificativas e trocas.
-- Mantém perfis de acesso: USUARIOPERFIL e USUARIOUNIDADE.
-- NÃO altera FDN_USERTENANT (Fluig), GFILIAL, médicos nem tipos.
--
-- Uso (SSMS / sqlcmd): rode no banco PRINCIPAL da aplicação.
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @qtdReg INT, @qtdJust INT, @qtdTroca INT, @qtdPlantao INT;
DECLARE @qtdPerfil INT, @qtdUnidade INT;

SELECT @qtdReg = COUNT(*) FROM REGISTROACESSO;
SELECT @qtdJust = COUNT(*) FROM JUSTIFICATIVAAUSENCIA;
SELECT @qtdTroca = COUNT(*) FROM ESCALATROCA;
SELECT @qtdPlantao = COUNT(*) FROM ESCALAMEDICA;
SELECT @qtdPerfil = COUNT(*) FROM USUARIOPERFIL;
SELECT @qtdUnidade = COUNT(*) FROM USUARIOUNIDADE;

PRINT '--- Antes do reset ---';
PRINT 'REGISTROACESSO:          ' + CAST(@qtdReg AS VARCHAR(20));
PRINT 'JUSTIFICATIVAAUSENCIA:   ' + CAST(@qtdJust AS VARCHAR(20));
PRINT 'ESCALATROCA:             ' + CAST(@qtdTroca AS VARCHAR(20));
PRINT 'ESCALAMEDICA:            ' + CAST(@qtdPlantao AS VARCHAR(20));
PRINT 'USUARIOPERFIL (mantém):  ' + CAST(@qtdPerfil AS VARCHAR(20));
PRINT 'USUARIOUNIDADE (mantém): ' + CAST(@qtdUnidade AS VARCHAR(20));

-- Ordem respeita FKs → ESCALAMEDICA
DELETE FROM REGISTROACESSO;
DELETE FROM JUSTIFICATIVAAUSENCIA;
DELETE FROM ESCALATROCA;
DELETE FROM ESCALAMEDICA;

-- Reinicia IDENTITY das tabelas limpas
IF EXISTS (SELECT 1 FROM sys.identity_columns WHERE object_id = OBJECT_ID('dbo.REGISTROACESSO'))
  DBCC CHECKIDENT ('dbo.REGISTROACESSO', RESEED, 0);
IF EXISTS (SELECT 1 FROM sys.identity_columns WHERE object_id = OBJECT_ID('dbo.JUSTIFICATIVAAUSENCIA'))
  DBCC CHECKIDENT ('dbo.JUSTIFICATIVAAUSENCIA', RESEED, 0);
IF EXISTS (SELECT 1 FROM sys.identity_columns WHERE object_id = OBJECT_ID('dbo.ESCALATROCA'))
  DBCC CHECKIDENT ('dbo.ESCALATROCA', RESEED, 0);
IF EXISTS (SELECT 1 FROM sys.identity_columns WHERE object_id = OBJECT_ID('dbo.ESCALAMEDICA'))
  DBCC CHECKIDENT ('dbo.ESCALAMEDICA', RESEED, 0);

SELECT @qtdReg = COUNT(*) FROM REGISTROACESSO;
SELECT @qtdJust = COUNT(*) FROM JUSTIFICATIVAAUSENCIA;
SELECT @qtdTroca = COUNT(*) FROM ESCALATROCA;
SELECT @qtdPlantao = COUNT(*) FROM ESCALAMEDICA;
SELECT @qtdPerfil = COUNT(*) FROM USUARIOPERFIL;
SELECT @qtdUnidade = COUNT(*) FROM USUARIOUNIDADE;

PRINT '--- Depois do reset ---';
PRINT 'REGISTROACESSO:          ' + CAST(@qtdReg AS VARCHAR(20));
PRINT 'JUSTIFICATIVAAUSENCIA:   ' + CAST(@qtdJust AS VARCHAR(20));
PRINT 'ESCALATROCA:             ' + CAST(@qtdTroca AS VARCHAR(20));
PRINT 'ESCALAMEDICA:            ' + CAST(@qtdPlantao AS VARCHAR(20));
PRINT 'USUARIOPERFIL (mantém):  ' + CAST(@qtdPerfil AS VARCHAR(20));
PRINT 'USUARIOUNIDADE (mantém): ' + CAST(@qtdUnidade AS VARCHAR(20));
PRINT 'Reset de testes concluído.';

COMMIT TRANSACTION;
GO
