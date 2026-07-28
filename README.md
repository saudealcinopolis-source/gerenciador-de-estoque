# 📦 Sistema de Gerenciamento de Estoque

> Sistema web robusto, responsivo e com suporte offline (PWA) para controle de estoque, desenvolvido sob medida para instituições de saúde pública e almoxarifados.

**Desenvolvido por:** [Thiago Souza Tavares](https://github.com/saudealcinopolis-source)  
**Versão:** 1.0.0  
**Status:** ✅ Em Produção

---

## 🚀 Sobre o Projeto

Este sistema foi criado para resolver problemas reais de controle de estoque em ambientes com conectividade instável. Ele permite o cadastro, movimentação e monitoramento rigoroso de materiais, com destaque para o controle de validade (método FEFO - *First Expired, First Out*) e a separação lógica entre Materiais Permanentes (com controle de patrimônio) e Materiais de Consumo (com controle de lote e validade).

---

## ✨ Principais Funcionalidades

- 📱 **PWA (Progressive Web App)**: Instalável em celulares e desktops, com funcionamento **100% Offline** e sincronização automática ao recuperar a conexão.
- 📊 **Dashboard Inteligente**: Visão geral com contadores de produtos por faixa de vencimento (>120, ≤90, ≤60, ≤30 dias).
- 🏷️ **Categorias Específicas**: Material Permanente, Material de Limpeza, Gênero Alimentício, Material de Expediente, Gás e Material de Informática.
- 📋 **Controle de Permanentes**: Campos exclusivos para Marca, Modelo e Nº de Patrimônio.
- ⏰ **Controle de Validade**: Alertas visuais e relatórios de produtos vencidos ou próximos do vencimento.
- 📑 **Relatórios Avançados**: Geração de relatórios de Produtos e Movimentações com filtros por categoria e período, otimizados para impressão (PDF).
- 💾 **Backup Inteligente**: Sistema de backup automático e manual com retenção configurável e detecção de alterações (só faz backup se o banco mudou).
- 🔐 **Controle de Acesso**: Perfis de Administrador, Gestor e Usuário, com permissões específicas.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express.js
- **Banco de Dados**: SQLite (via `sql.js` - banco de dados em arquivo, sem necessidade de servidor SQL externo)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Recursos Avançados**: Service Workers (PWA/Offline), LocalStorage, Crypto (Hash de backup)

---

## 📋 Pré-requisitos

Certifique-se de ter instalado em sua máquina:
- [Node.js](https://nodejs.org/) (Versão 18 ou superior recomendada)
- [Git](https://git-scm.com/)

---

## ⚙️ Instalação e Configuração

Siga os passos abaixo para rodar o projeto localmente:

1. **Clone o repositório:**
bash
git clone https://github.com/saudealcinopolis-source/gerenciador-de-estoque.git
cd gerenciador-de-estoque


2. **Instale as dependências:**
   ```bash
   npm install

3. **Inicie o servidor**
    ```bash
   npm start

4. **Acesse o sistema**
    ```bash
Abra seu navegador e vá para: http://localhost:3000

## 🔑 Acesso Inicial
Na primeira execução, o sistema cria automaticamente um usuário administrador:
Usuário: admin
Senha: admin123

## 📂 Estrutura do Projeto

gerenciador-de-estoque/
│
├── 📁 database/ # Arquivos do banco de dados SQLite (Ignorado pelo Git)
│ └── estoque.db
│
├── 📁 backups/ # Cópias de segurança locais (Ignorado pelo Git)
│ └── backup_YYYY-MM-DD.db
│
├── public/ # Frontend do sistema
│ ├── 📁 assets/ # Imagens e ícones (favicon, logo)
│ │ └── logo.ico
│ │
│ ├── 📁 css/ # Estilos
│ │ └── styles.css
│ │
│ ├── 📁 js/ # Lógica do frontend
│ │ ── app.js
│ │
│ ├── 📄 index.html # Página principal
│ ├── 📄 manifest.json # Configuração do PWA
│ └── 📄 sw.js # Service Worker (Funcionalidade Offline)
│
├── .gitignore # Arquivos ignorados pelo controle de versão
├── 📄 package.json # Dependências e scripts do Node.js
├── 📄 server.js # Servidor Backend e rotas da API
└── 📄 README.md # Este arquivo


## 💡 Dicas de Uso

**1. Funcionamento Offline: Se a internet cair, você pode continuar cadastrando produtos ou dando baixa. O sistema salvará localmente e sincronizará automaticamente assim que a conexão voltar.**

**2. Backup na Nuvem: Recomenda-se configurar o "Google Drive para Computador" para sincronizar a pasta backups/ automaticamente, garantindo segurança extra aos dados.**

**3. Impressão: Os relatórios possuem um modo de impressão otimizado (Ctrl + P), ocultando menus e botões para gerar documentos limpos em PDF ou papel**

## 📄 Licença

Este projeto é de uso interno e proprietário da organização de saúde vinculada.
Desenvolvido por Thiago Souza Tavares.