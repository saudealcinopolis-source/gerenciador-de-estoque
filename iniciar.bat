@echo off
chcp 65001 >nul
title Sistema de Estoque + Google Drive
color 0A

echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║   INICIANDO SISTEMA E SALVANDO NO GOOGLE DRIVE     ║
echo  ╚════════════════════════════════════════════════════╝
echo.

:: ==========================================================
:: CONFIGURAÇÃO DO CAMINHO DO GOOGLE DRIVE
:: O Google Drive para Desktop geralmente usa um destes caminhos:
:: Opção 1 (Pasta no Usuário): C:\Users\Endemias\Google Drive\Meu Drive
:: Opção 2 (Unidade Virtual): G:\Meu Drive  (ou outra letra)
:: ==========================================================

:: DESCOMENTE (remova os ::) da linha que corresponder ao seu Google Drive:
set "GDRIVE_PATH=%USERPROFILE%\Google Drive\Meu Drive\Backups_Estoque"
:: set "GDRIVE_PATH=G:\Meu Drive\Grenciamento de Estoque\Backup CMCV"

:: Cria a pasta no Google Drive se ela não existir
if not exist "%GDRIVE_PATH%" (
    echo  [INFO] Criando pasta de destino no Google Drive...
    mkdir "%GDRIVE_PATH%"
)

:: ==========================================================
:: 1. BACKUP DO BANCO DE DADOS ATUAL (Cópia de segurança rápida)
:: ==========================================================
echo  [1/3] Salvando cópia do banco de dados atual no Google Drive...
if exist "database\estoque.db" (
    :: Gera um nome com data e hora para não sobrescrever
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%b-%%a)
    for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
    
    copy /Y "database\estoque.db" "%GDRIVE_PATH%\estoque_%mydate%_%mytime%.db" >nul
    echo  [OK] Banco de dados copiado com sucesso!
) else (
    echo  [AVISO] Banco de dados 'estoque.db' nao encontrado.
)

:: ==========================================================
:: 2. SINCRONIZAR PASTA DE BACKUPS (Histórico completo)
:: ==========================================================
echo  [2/3] Sincronizando historico de backups com o Google Drive...
if exist "backups\" (
    xcopy /E /I /Y "backups\*" "%GDRIVE_PATH%\historico\" >nul
    echo  [OK] Historico de backups sincronizado!
) else (
    echo  [INFO] Pasta de backups ainda nao possui arquivos.
)

:: ==========================================================
:: 3. INICIAR O SERVIDOR
:: ==========================================================
echo.
echo  [3/3] Iniciando o servidor do sistema...
echo  ════════════════════════════════════════════════════
echo  Acesse no navegador: http://localhost:3000
echo  O Google Drive sincronizara os arquivos em segundo plano.
echo  ════════════════════════════════════════════════════
echo.

:: Abre o navegador automaticamente após 3 segundos
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Inicia o servidor Node.js
node server.js

:: Se o servidor parar, mostra mensagem
echo.
color 0C
echo  ╔════════════════════════════════════════════════════╗
echo  ║   SERVIDOR PAROU                                   ║
echo  ╚════════════════════════════════════════════════════╝
echo.
pause