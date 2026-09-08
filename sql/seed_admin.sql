-- ============================================================
-- Cria um usuario ADMIN base para o sistema de Escala Medica.
-- Rode a PARTE 1 no banco do FLUIG (onde vive FDN_USERTENANT).
-- Rode a PARTE 2 no banco PRINCIPAL desta aplicacao (USUARIOPERFIL).
--
-- O login administrativo compara PASSWORD como MD5 em hexadecimal
-- (mesmo formato que o Node gera com crypto.createHash('md5')).
-- Um INSERT direto com a senha em texto puro NAO funciona -- por
-- isso o erro "nao reconhece a senha". Este script ja hasheia.
-- ============================================================

-- ==================== PARTE 1 - banco FLUIG ====================
-- AJUSTE os valores abaixo para o seu ambiente antes de rodar.
DECLARE @login   VARCHAR(100) = 'admin';
DECLARE @senha   VARCHAR(100) = 'TrocarEssaSenha123';   -- senha em texto puro, so aqui no script
DECLARE @email   VARCHAR(200) = 'admin@hmtj.com.br';
DECLARE @tenantId INT = 1;        -- AJUSTE: TENANT_ID valido no seu Fluig
DECLARE @locationId INT = NULL;   -- AJUSTE se for obrigatorio no seu ambiente

INSERT INTO FDN_USERTENANT
    (EMAIL, FIRST_ACCESS, LOCATION_ID, LOGIN, PASSWORD, TENANT_ID, USER_STATE, USER_UUID, LAST_UPDATE_DATE)
VALUES
    (@email, 0, @locationId, @login,
     CONVERT(VARCHAR(32), HASHBYTES('MD5', @senha), 2), -- hex sem 0x, compativel com md5() do Node
     @tenantId, 1, NEWID(), GETDATE());

-- ==================== PARTE 2 - banco PRINCIPAL desta aplicacao ====================
-- Rode separadamente, no banco onde vive USUARIOPERFIL.
INSERT INTO USUARIOPERFIL (LOGIN, PERFIL, ATIVO)
VALUES ('admin', 'ADMIN', 1);
