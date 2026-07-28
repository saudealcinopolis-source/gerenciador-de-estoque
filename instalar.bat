@echo off
chcp 65001 >nul
title Instalacao do Sistema de Estoque
color 0B

echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║   INSTALACAO DO SISTEMA DE ESTOQUE                 ║
echo  ╚════════════════════════════════════════════════════╝
echo.

:: Verifica Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  [ERRO] Node.js nao encontrado!
    echo.
    echo  Baixe e instale o Node.js em: https://nodejs.org
    echo  Escolha a versao LTS (recomendado: 18 ou superior^)
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js encontrado:
node --version
echo.

:: Verifica npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  [ERRO] npm nao encontrado!
    pause
    exit /b 1
)

echo  [OK] npm encontrado:
npm --version
echo.

:: Verifica se já existe node_modules
if exist "node_modules" (
    echo  [INFO] Dependencias ja instaladas.
    echo  Deseja reinstalar? (S/N^)
    set /p reinstalar=
    if /i "%reinstalar%"=="S" (
        echo.
        echo  Removendo instalacao anterior...
        rmdir /s /q node_modules
        if exist "package-lock.json" del package-lock.json
    ) else (
        goto :pular_instalacao
    )
)

echo.
echo  ════════════════════════════════════════════════════
echo  Instalando dependencias (pode demorar alguns minutos^)...
echo  ════════════════════════════════════════════════════
echo.

:: Instala as dependencias
call npm install

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ╔════════════════════════════════════════════════════╗
    echo  ║   ERRO NA INSTALACAO                               ║
    echo  ╚════════════════════════════════════════════════════╝
    echo.
    echo  Provavelmente faltam as ferramentas de compilacao.
    echo.
    echo  SOLUCAO: Abra o PowerShell como ADMINISTRADOR e execute:
    echo.
    echo     npm install --global windows-build-tools
    echo.
    echo  Ou instale manualmente:
    echo     - Visual Studio Build Tools (com C++^)
    echo     - Python (com Add to PATH^)
    echo.
    echo  Depois reinicie este script.
    echo.
    pause
    exit /b 1
)

:pular_instalacao

:: Cria pastas necessarias
if not exist "database" mkdir database
if not exist "backups" mkdir backups
if not exist "public\css" mkdir public\css
if not exist "public\js" mkdir public\js

echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║   INSTALACAO CONCLUIDA COM SUCESSO!                ║
echo  ╚════════════════════════════════════════════════════╝
echo.
echo  Para iniciar o sistema, execute: iniciar.bat
echo.
echo  Login padrao:
echo    Usuario: admin
echo    Senha:   admin123
echo.
pause