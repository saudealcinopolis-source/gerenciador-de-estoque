// ESTADO GLOBAL
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let produtos = [];
let categorias = [];
let notificacoesLidas = JSON.parse(localStorage.getItem('notificacoesLidas') || '[]');

// TEMA
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    const theme = document.documentElement.getAttribute('data-theme');
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Inicializar tema e evento
initTheme();

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// API
async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    
    // Verifica se a resposta é realmente JSON
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { logout(); return null; }
        throw new Error(data.error || 'Erro na requisição');
      }
      return data;
    } else {
      // Se for HTML (erro do servidor), lê como texto e mostra no console
      const text = await res.text();
      console.error('❌ O servidor retornou HTML em vez de JSON. Erro real:', text);
      throw new Error('Erro interno do servidor. Verifique o terminal (tela preta).');
    }
  } catch (error) {
    console.error('API Error:', error);
    toast(error.message, 'error');
    return null;
  }
}

// TOAST
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// LOGIN
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;
    
    const data = await api('/api/login', {
      method: 'POST',
      body: { username, password }
    });
    
    if (data) {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(currentUser));
      showApp();
    }
  });
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
  currentUser = null;
  location.reload();
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// ============ MOSTRAR APP ============
function showApp() {
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  
  if (loginScreen) loginScreen.classList.add('hidden');
  if (appScreen) appScreen.classList.remove('hidden');
  
  const userName = document.getElementById('userName');
  const userPerfil = document.getElementById('userPerfil');
  
  if (userName && currentUser) userName.textContent = currentUser.nome;
  if (userPerfil && currentUser) userPerfil.textContent = currentUser.perfil;

  // Esconder menus admin se não for admin
  if (currentUser && currentUser.perfil !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  
  // Esconder botões de gestor se for usuário comum
  if (currentUser && currentUser.perfil === 'usuario') {
    document.querySelectorAll('.gestor-admin-only').forEach(el => el.style.display = 'none');
  }

  loadCategorias();
  loadNotificacoes();
  setInterval(loadNotificacoes, 60000);

  // RESTAURAR A ÚLTIMA ABA VISUALIZADA
  let lastTab = localStorage.getItem('lastActiveTab') || 'dashboard';
  const navItem = document.querySelector(`.nav-item[data-page="${lastTab}"]`);
  
  // Se a aba estiver oculta (ex: usuário comum tentando acessar backup), volta para dashboard
  if (!navItem || navItem.style.display === 'none') {
    lastTab = 'dashboard';
  }

  // Ativar visualmente a aba
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const activeNavItem = document.querySelector(`.nav-item[data-page="${lastTab}"]`);
  if (activeNavItem) activeNavItem.classList.add('active');

  // Mostrar a página correta
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const targetPage = document.getElementById(`page-${lastTab}`);
  if (targetPage) {
    targetPage.classList.remove('hidden');
    loadPage(lastTab);
  } else {
    loadPage('dashboard');
  }
}

if (token && currentUser) showApp();

// ============ NAVEGAÇÃO ============
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    
    const page = item.dataset.page;
    
    // SALVA A ABA ATUAL NA MEMÓRIA
    localStorage.setItem('lastActiveTab', page);
    
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
      loadPage(page);
    }
  });
});

function loadPage(page) {
  switch(page) {
    case 'dashboard': loadDashboard(); break;
    case 'produtos': loadProdutos(); break;
    case 'movimentacoes': loadMovimentacoes(); break;
    case 'vencimentos': loadVencimentos(); break;
    case 'usuarios': loadUsuarios(); break;
    case 'backup': 
      loadBackupConfig();
      loadBackups();
      loadBackupStats();
      break;
  }
}

// DASHBOARD
async function loadDashboard() {
  const data = await api('/api/dashboard');
  if (!data) return;
  
  const statsGrid = document.getElementById('statsGrid');
  if (statsGrid) {
    statsGrid.innerHTML = `
      <div class="stat-card"><div class="label">Produtos</div><div class="value">${data.totalProdutos || 0}</div></div>
      <div class="stat-card success"><div class="label">Em Estoque</div><div class="value">${data.totalItens || 0}</div></div>
      <div class="stat-card warning"><div class="label">Vencendo (10d)</div><div class="value">${data.vencendo10 || 0}</div></div>
      <div class="stat-card danger"><div class="label">Vencidos</div><div class="value">${data.vencidos || 0}</div></div>
    `;
  }

  await loadPrioridadeLotes();
  await loadDashAlerts();
}

// PRIORIDADE FEFO
async function loadPrioridadeLotes() {
  const prods = await api('/api/produtos');
  if (!prods) return;
  
  const container = document.getElementById('dashPrioridade');
  const tbody = document.getElementById('prioridadeTable');
  
  if (!container || !tbody) return;
  
  const comValidade = prods.filter(p => p.data_validade && p.quantidade > 0);
  comValidade.sort((a, b) => new Date(a.data_validade) - new Date(b.data_validade));
  
  if (comValidade.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  tbody.innerHTML = comValidade.map((p, index) => {
    const dias = diasParaVencimento(p.data_validade);
    const prioridade = index + 1;
    
    let statusClass = '', statusIcon = '', statusText = '';
    if (dias < 0) {
      statusClass = 'badge-danger'; statusIcon = '🚨'; statusText = `VENCIDO (${Math.abs(dias)}d)`;
    } else if (dias <= 10) {
      statusClass = 'badge-danger'; statusIcon = '⚠️'; statusText = `${dias} dias`;
    } else if (dias <= 30) {
      statusClass = 'badge-warning'; statusIcon = '⏰'; statusText = `${dias} dias`;
    } else if (dias <= 90) {
      statusClass = 'badge-info'; statusIcon = ''; statusText = `${dias} dias`;
    } else {
      statusClass = 'badge-success'; statusIcon = '✅'; statusText = `${dias} dias`;
    }
    
    const urgente = prioridade <= 3 ? 'style="background: rgba(239, 68, 68, 0.08);"' : '';
    
    return `
      <tr ${urgente}>
        <td><strong style="color: ${prioridade <= 3 ? 'var(--danger)' : 'var(--text-light)'}">#${prioridade}</strong> ${prioridade <= 3 ? '🔥' : ''}</td>
        <td><strong>${p.nome}</strong></td>
        <td><code style="background: var(--bg); padding: 4px 8px; border-radius: 4px;">${p.lote || 'N/A'}</code></td>
        <td>${formatDate(p.data_validade)}</td>
        <td><span class="badge ${statusClass}">${statusIcon} ${statusText}</span></td>
        <td>${p.quantidade} ${p.unidade}</td>
        <td><button class="btn btn-primary btn-sm" onclick="verDetalhesVencimento(${p.id})">Ver</button></td>
      </tr>
    `;
  }).join('');
}

// ALERTAS DASHBOARD
async function loadDashAlerts() {
  const notifs = await api('/api/notificacoes');
  if (!notifs) return;
  
  const dashDetails = document.getElementById('dashDetails');
  if (!dashDetails) return;
  
  let html = '';

  if (notifs.vencidos?.length) {
    html += `<div class="card"><h3 style="color: var(--danger); margin-bottom: 16px;">🚨 Vencidos (${notifs.vencidos.length})</h3>
      <table><thead><tr><th>Produto</th><th>Validade</th><th>Dias</th><th>Ações</th></tr></thead><tbody>
      ${notifs.vencidos.map(p => `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${formatDate(p.data_validade)}</td>
          <td><span class="badge badge-danger">${p.dias_vencido}d</span></td>
          <td><button class="btn btn-primary btn-sm" onclick="verDetalhesVencimento(${p.id})">Ver</button></td>
        </tr>
      `).join('')}</tbody></table></div>`;
  }

  if (notifs.vencendo?.length) {
    html += `<div class="card"><h3 style="color: var(--warning); margin-bottom: 16px;">⚠️ Vencendo (${notifs.vencendo.length})</h3>
      <table><thead><tr><th>Produto</th><th>Validade</th><th>Dias</th><th>Ações</th></tr></thead><tbody>
      ${notifs.vencendo.map(p => `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${formatDate(p.data_validade)}</td>
          <td><span class="badge badge-warning">${p.dias_restantes}d</span></td>
          <td><button class="btn btn-primary btn-sm" onclick="verDetalhesVencimento(${p.id})">Ver</button></td>
        </tr>
      `).join('')}</tbody></table></div>`;
  }

  if (notifs.estoqueBaixo?.length) {
    html += `<div class="card"><h3 style="color: var(--primary); margin-bottom: 16px;">📦 Estoque Baixo (${notifs.estoqueBaixo.length})</h3>
      <table><thead><tr><th>Produto</th><th>Qtd</th><th>Mín</th><th>Ações</th></tr></thead><tbody>
      ${notifs.estoqueBaixo.map(p => `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td><span class="badge badge-danger">${p.quantidade}</span></td>
          <td>${p.quantidade_minima}</td>
          <td><button class="btn btn-primary btn-sm" onclick="verDetalhesVencimento(${p.id})">Ver</button></td>
        </tr>
      `).join('')}</tbody></table></div>`;
  }

  if (!html) html = '<div class="card"><div class="alert alert-success">✅ Tudo em ordem!</div></div>';
  
  dashDetails.innerHTML = html;
}

// NOTIFICAÇÕES
async function loadNotificacoes() {
  const data = await api('/api/notificacoes');
  if (!data) return;
  
  const total = (data.vencidos?.length || 0) + (data.vencendo?.length || 0) + (data.estoqueBaixo?.length || 0);
  const countEl = document.getElementById('notifCount');
  
  if (countEl) {
    const naoLidas = total - notificacoesLidas.length;
    if (naoLidas > 0) {
      countEl.textContent = naoLidas;
      countEl.classList.remove('hidden');
    } else {
      countEl.classList.add('hidden');
    }
  }

  const notifList = document.getElementById('notifList');
  if (!notifList) return;
  
  let html = '';
  
  data.vencidos?.forEach(p => {
    const id = `vencido_${p.id}`;
    const isRead = notificacoesLidas.includes(id);
    html += `<div class="notification-item danger ${isRead ? 'read' : ''}" data-id="${id}">
      <div class="title">🚨 ${p.nome} - VENCIDO</div>
      <div class="desc">${p.dias_vencido}d atrás</div>
      ${!isRead ? `<button class="btn-mark-read" onclick="marcarComoLida('${id}', event)">Marcar lida</button>` : ''}
    </div>`;
  });
  
  data.vencendo?.forEach(p => {
    const id = `vencendo_${p.id}`;
    const isRead = notificacoesLidas.includes(id);
    html += `<div class="notification-item warning ${isRead ? 'read' : ''}" data-id="${id}">
      <div class="title">️ ${p.nome}</div>
      <div class="desc">Vence em ${p.dias_restantes}d</div>
      ${!isRead ? `<button class="btn-mark-read" onclick="marcarComoLida('${id}', event)">Marcar lida</button>` : ''}
    </div>`;
  });
  
  data.estoqueBaixo?.forEach(p => {
    const id = `estoque_${p.id}`;
    const isRead = notificacoesLidas.includes(id);
    html += `<div class="notification-item ${isRead ? 'read' : ''}" data-id="${id}">
      <div class="title">📦 ${p.nome} - Estoque baixo</div>
      <div class="desc">${p.quantidade} un. (mín: ${p.quantidade_minima})</div>
      ${!isRead ? `<button class="btn-mark-read" onclick="marcarComoLida('${id}', event)">Marcar lida</button>` : ''}
    </div>`;
  });
  
  if (!html) html = '<div style="padding: 20px; text-align: center; color: var(--text-light);">Sem notificações</div>';
  
  notifList.innerHTML = html;
}

function marcarComoLida(id, event) {
  if (event) event.stopPropagation();
  if (!notificacoesLidas.includes(id)) {
    notificacoesLidas.push(id);
    localStorage.setItem('notificacoesLidas', JSON.stringify(notificacoesLidas));
    loadNotificacoes();
  }
}

const markAllReadBtn = document.getElementById('markAllReadBtn');
if (markAllReadBtn) {
  markAllReadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.notification-item:not(.read)').forEach(item => {
      const id = item.dataset.id;
      if (!notificacoesLidas.includes(id)) notificacoesLidas.push(id);
    });
    localStorage.setItem('notificacoesLidas', JSON.stringify(notificacoesLidas));
    loadNotificacoes();
    toast('Todas marcadas como lidas', 'success');
  });
}

const notifBell = document.getElementById('notifBell');
if (notifBell) {
  notifBell.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (panel) panel.classList.toggle('active');
  });
}

document.addEventListener('click', () => {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.classList.remove('active');
});

// CATEGORIAS
async function loadCategorias() {
  categorias = await api('/api/categorias');
  if (!categorias) return;
  
  const selects = [document.getElementById('prodCategoria'), document.getElementById('filterCategoria')];
  selects.forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    const isFilter = sel.id === 'filterCategoria';
    sel.innerHTML = isFilter ? '<option value="">Todas categorias</option>' : '';
    categorias.forEach(c => {
      sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
    sel.value = current;
  });
}

// PRODUTOS
async function loadProdutos() {
  produtos = await api('/api/produtos');
  if (!produtos) return;
  renderProdutos();
}

function renderProdutos() {
  const search = document.getElementById('searchProduto')?.value.toLowerCase() || '';
  const catFilter = document.getElementById('filterCategoria')?.value || '';
  
  const filtered = produtos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(search) || (p.lote || '').toLowerCase().includes(search);
    const matchCat = !catFilter || p.categoria_id == catFilter;
    return matchSearch && matchCat;
  });

  const tbody = document.getElementById('produtosTable');
  if (!tbody) return;
  
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 40px;">Nenhum produto</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const validade = p.data_validade ? formatDate(p.data_validade) : '-';
    const dias = p.data_validade ? diasParaVencimento(p.data_validade) : null;
    let validadeBadge = '';
    if (dias !== null) {
      if (dias < 0) validadeBadge = '<span class="badge badge-danger">VENCIDO</span>';
      else if (dias <= 10) validadeBadge = `<span class="badge badge-warning">${dias}d</span>`;
      else validadeBadge = `<span class="badge badge-success">${dias}d</span>`;
    }
    const qtdBadge = p.quantidade <= p.quantidade_minima && p.quantidade_minima > 0
      ? `<span class="badge badge-danger">${p.quantidade}</span>` : p.quantidade;

    let acoes = '';
    if (currentUser?.perfil === 'usuario') {
      acoes = `<button class="btn btn-warning btn-sm" onclick="openMovModal('saida', ${p.id})">Baixa</button>`;
    } else if (currentUser?.perfil === 'gestor') {
      acoes = `<button class="btn btn-primary btn-sm" onclick="editProduto(${p.id})">Editar</button>`;
    } else if (currentUser?.perfil === 'admin') {
      acoes = `<button class="btn btn-primary btn-sm" onclick="editProduto(${p.id})">Editar</button>
               <button class="btn btn-danger btn-sm" onclick="deleteProduto(${p.id})">Excluir</button>`;
    }

    return `<tr>
      <td><strong>${p.nome}</strong></td>
      <td><span class="badge badge-info">${p.categoria_nome || '-'}</span></td>
      <td>${qtdBadge} ${p.unidade}</td>
      <td>${p.quantidade_minima}</td>
      <td>${validade} ${validadeBadge}</td>
      <td>${p.lote || '-'}</td>
      <td>${acoes}</td>
    </tr>`;
  }).join('');
}

const searchProduto = document.getElementById('searchProduto');
if (searchProduto) searchProduto.addEventListener('input', renderProdutos);

const filterCategoria = document.getElementById('filterCategoria');
if (filterCategoria) filterCategoria.addEventListener('change', renderProdutos);


// MOVIMENTAÇÕES
async function loadMovimentacoes() {
  const movs = await api('/api/movimentacoes');
  if (!movs) return;
  
  const tbody = document.getElementById('movTable');
  if (!tbody) return;
  
  if (!movs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 40px;">Sem movimentações</td></tr>';
    return;
  }
  
  tbody.innerHTML = movs.map(m => `
    <tr>
      <td>${new Date(m.data_movimentacao).toLocaleString('pt-BR')}</td>
      <td><strong>${m.produto_nome}</strong></td>
      <td><span class="badge ${m.tipo === 'entrada' ? 'badge-success' : 'badge-warning'}">${m.tipo === 'entrada' ? ' Entrada' : '📤 Saída'}</span></td>
      <td>${m.quantidade}</td>
      <td>${m.motivo || '-'}</td>
      <td>${m.usuario_nome || '-'}</td>
    </tr>
  `).join('');
}

function openMovModal(tipo, produtoId = null) {
  const modalTitle = document.getElementById('modalMovTitle');
  if (modalTitle) modalTitle.textContent = tipo === 'entrada' ? '📥 Entrada' : '📤 Saída';
  
  const movTipo = document.getElementById('movTipo');
  if (movTipo) movTipo.value = tipo;
  
  const form = document.getElementById('formMov');
  if (form) form.reset();
  
  const sel = document.getElementById('movProduto');
  if (sel) {
    sel.innerHTML = '<option value="">Selecione...</option>';
    produtos.forEach(p => {
      sel.innerHTML += `<option value="${p.id}">${p.nome} (estoque: ${p.quantidade})</option>`;
    });
    if (produtoId) sel.value = produtoId;
  }
  
  const modal = document.getElementById('modalMov');
  if (modal) modal.classList.add('active');
}

async function saveMov() {
  const tipo = document.getElementById('movTipo')?.value;
  const data = {
    produto_id: parseInt(document.getElementById('movProduto')?.value),
    tipo,
    quantidade: parseInt(document.getElementById('movQtd')?.value),
    motivo: document.getElementById('movMotivo')?.value
  };
  
  if (!data.produto_id || !data.quantidade) {
    toast('Preencha produto e quantidade', 'error');
    return;
  }
  
  try {
    await api('/api/movimentacoes', { method: 'POST', body: data });
    toast(tipo === 'entrada' ? 'Entrada registrada' : 'Baixa registrada', 'success');
    closeModal('modalMov');
    loadProdutos();
    loadMovimentacoes();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// VENCIMENTOS
async function loadVencimentos() {
  const [vencidos, vencendo] = await Promise.all([
    api('/api/produtos/vencidos'),
    api('/api/produtos/vencendo?dias=10')
  ]);
  
  const vencidosTable = document.getElementById('vencidosTable');
  const vencendoTable = document.getElementById('vencendoTable');
  
  if (vencidosTable) {
    vencidosTable.innerHTML = vencidos?.length
      ? vencidos.map(p => `<tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.categoria_nome || '-'}</td>
          <td>${formatDate(p.data_validade)}</td>
          <td><span class="badge badge-danger">${p.dias_vencido}d</span></td>
          <td><button class="btn btn-primary btn-sm" onclick="verDetalhesVencimento(${p.id})">Ver</button></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="text-center" style="padding: 20px;">✅ Nenhum vencido</td></tr>';
  }
  
  if (vencendoTable) {
    vencendoTable.innerHTML = vencendo?.length
      ? vencendo.map(p => `<tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.categoria_nome || '-'}</td>
          <td>${formatDate(p.data_validade)}</td>
          <td><span class="badge badge-warning">${p.dias_restantes}d</span></td>
          <td><button class="btn btn-primary btn-sm" onclick="verDetalhesVencimento(${p.id})">Ver</button></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="text-center" style="padding: 20px;">✅ Nenhum próximo do vencimento</td></tr>';
  }
}

// DETALHES
// ============ MODAL DE DETALHES ============
async function verDetalhesVencimento(produtoId) {
  console.log('Ver detalhes do produto:', produtoId);
  
  // Recarregar produtos se necessário
  if (!produtos || produtos.length === 0) {
    produtos = await api('/api/produtos');
  }
  
  const produto = produtos.find(p => p.id === produtoId);
  
  if (!produto) {
    console.error('Produto não encontrado:', produtoId);
    toast('Produto não encontrado', 'error');
    return;
  }

  console.log('Produto encontrado:', produto);

  const dias = produto.data_validade ? diasParaVencimento(produto.data_validade) : null;
  let statusValidade = '';
  if (dias !== null) {
    if (dias < 0) statusValidade = `<span class="badge badge-danger">VENCIDO há ${Math.abs(dias)} dia(s)</span>`;
    else if (dias <= 10) statusValidade = `<span class="badge badge-warning">Vence em ${dias} dia(s)</span>`;
    else statusValidade = `<span class="badge badge-success">Válido por mais ${dias} dia(s)</span>`;
  } else {
    statusValidade = '<span class="badge badge-info">Sem validade definida</span>';
  }

  const html = `
    <div style="display: grid; gap: 16px;">
      <div>
        <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Nome do Produto</label>
        <div style="font-size: 18px; font-weight: 600; margin-top: 4px;">${produto.nome}</div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Categoria</label>
          <div style="margin-top: 4px;"><span class="badge badge-info">${produto.categoria_nome || '-'}</span></div>
        </div>
        <div>
          <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Quantidade</label>
          <div style="font-size: 18px; font-weight: 600; margin-top: 4px;">${produto.quantidade} ${produto.unidade}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Data de Validade</label>
          <div style="margin-top: 4px;">${produto.data_validade ? formatDate(produto.data_validade) : 'Não definida'}</div>
        </div>
        <div>
          <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Status</label>
          <div style="margin-top: 4px;">${statusValidade}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Lote</label>
          <div style="font-size: 16px; font-weight: 500; margin-top: 4px; padding: 8px; background: var(--bg); border-radius: 6px;">${produto.lote || 'Não informado'}</div>
        </div>
        <div>
          <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Localização</label>
          <div style="margin-top: 4px;">${produto.localizacao || 'Não informada'}</div>
        </div>
      </div>

      <div>
        <label style="font-weight: 600; color: var(--text-light); font-size: 12px; text-transform: uppercase;">Quantidade Mínima</label>
        <div style="margin-top: 4px;">${produto.quantidade_minima} ${produto.unidade}</div>
      </div>
    </div>
  `;

  const modalTitle = document.getElementById('modalVencimentoTitle');
  const modalBody = document.getElementById('modalVencimentoBody');
  const modal = document.getElementById('modalVencimento');
  
  if (modalTitle) modalTitle.textContent = 'Detalhes do Produto';
  if (modalBody) modalBody.innerHTML = html;
  if (modal) {
    modal.classList.add('active');
    console.log('Modal aberto');
  }
}

// USUÁRIOS
async function loadUsuarios() {
  const users = await api('/api/users');
  if (!users) return;
  
  const tbody = document.getElementById('usersTable');
  if (!tbody) return;
  
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.nome}</strong></td>
      <td>${u.username}</td>
      <td><span class="badge badge-primary">${u.perfil}</span></td>
      <td><span class="badge ${u.ativo ? 'badge-success' : 'badge-danger'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="editUser(${u.id})">Editar</button>
        ${u.id !== currentUser?.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Desativar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function openUserModal() {
  document.getElementById('modalUserTitle').textContent = 'Novo Usuário';
  document.getElementById('formUser').reset();
  document.getElementById('userId').value = '';
  document.getElementById('userPassword').required = true;
  document.getElementById('passHint').textContent = '*';
  document.getElementById('modalUser').classList.add('active');
}

async function editUser(id) {
  const users = await api('/api/users');
  if (!users) return;
  const u = users.find(x => x.id === id);
  if (!u) return;
  
  document.getElementById('modalUserTitle').textContent = 'Editar Usuário';
  document.getElementById('userId').value = u.id;
  document.getElementById('userNome').value = u.nome;
  document.getElementById('userUsername').value = u.username;
  document.getElementById('userPassword').value = '';
  document.getElementById('userPassword').required = false;
  document.getElementById('passHint').textContent = '(deixe em branco para manter)';
  document.getElementById('userPerfilSelect').value = u.perfil;
  document.getElementById('modalUser').classList.add('active');
}

async function saveUser() {
  const id = document.getElementById('userId')?.value;
  const data = {
    nome: document.getElementById('userNome')?.value,
    username: document.getElementById('userUsername')?.value,
    perfil: document.getElementById('userPerfilSelect')?.value,
    password: document.getElementById('userPassword')?.value
  };
  
  if (!data.nome || !data.username) {
    toast('Preencha todos os campos', 'error');
    return;
  }
  if (!id && !data.password) {
    toast('Informe a senha', 'error');
    return;
  }
  
  try {
    if (id) {
      await api(`/api/users/${id}`, { method: 'PUT', body: data });
      toast('Usuário atualizado', 'success');
    } else {
      await api('/api/users', { method: 'POST', body: data });
      toast('Usuário criado', 'success');
    }
    closeModal('modalUser');
    loadUsuarios();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Desativar?')) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    toast('Usuário desativado', 'success');
    loadUsuarios();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ============ BACKUP INTELIGENTE ============

let backupConfig = null;

async function loadBackupConfig() {
  backupConfig = await api('/api/backup-config');
  if (!backupConfig) return;
  
  const automatico = document.getElementById('backupAutomatico');
  const frequencia = document.getElementById('backupFrequencia');
  const horario = document.getElementById('backupHorario');
  const reter = document.getElementById('backupReter');
  const inteligente = document.getElementById('backupInteligente');
  
  if (automatico) automatico.checked = backupConfig.automatico;
  if (frequencia) frequencia.value = backupConfig.frequencia;
  if (horario) horario.value = backupConfig.horario;
  if (reter) reter.value = backupConfig.reter;
  if (inteligente) inteligente.checked = backupConfig.inteligente;
}

async function salvarConfigBackup() {
  const data = {
    automatico: document.getElementById('backupAutomatico').checked,
    frequencia: document.getElementById('backupFrequencia').value,
    horario: document.getElementById('backupHorario').value,
    reter: parseInt(document.getElementById('backupReter').value),
    inteligente: document.getElementById('backupInteligente').checked
  };
  
  const result = await api('/api/backup-config', { method: 'PUT', body: data });
  if (result) {
    toast('Configuração salva com sucesso!', 'success');
    loadBackupConfig();
    loadBackupStats();
  }
}

// ============ BACKUP INTELIGENTE BLINDADO============
async function criarBackup() {
  console.log("🔄 [FRONTEND] Iniciando backup manual...");
  try {
    const r = await api('/api/backup', { method: 'POST', body: { forcar: false } });
    
    console.log("📦 [FRONTEND] Resposta COMPLETA do servidor:", r);
    console.log("📦 [FRONTEND] r.sucesso =", r?.sucesso);
    console.log("📦 [FRONTEND] r.filename =", r?.filename);
    
    if (!r) {
      toast('Erro: servidor não respondeu', 'error');
      return;
    }
    
    // O backend retorna 'sucesso' (em português)
    if (r.sucesso === true) {
      const nomeArquivo = r.filename || r.nome || 'backup_realizado.db';
      toast(`Backup criado: ${nomeArquivo}`, 'success');
      
      console.log("✅ Backup criado com sucesso! Recarregando em 1.5s...");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } else if (r.motivo === 'sem_alteracoes') {
      toast('Nenhuma alteração detectada. Use "Forçar Backup" se necessário.', 'warning');
    } else {
      toast('Erro ao criar backup: ' + (r.erro || 'Desconhecido'), 'error');
    }
  } catch (error) {
    console.error("❌ [FRONTEND] Erro na função criarBackup:", error);
    toast('Erro inesperado: ' + error.message, 'error');
  }
}

async function forcarBackup() {
  if (!confirm('Forçar backup mesmo sem alterações?')) return;
  
  console.log("⚡ Forçando backup...");
  try {
    const r = await api('/api/backup/forcar', { method: 'POST' });
    console.log("📦 Resposta do forçar backup:", r);
    
    if (r && r.sucesso) {
      toast(`Backup forçado criado: ${r.filename}`, 'success');
      console.log("⏳ Recarregando a página em 1 segundo...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      toast('Erro ao forçar backup', 'error');
    }
  } catch (error) {
    console.error("❌ Erro na função forcarBackup:", error);
    toast('Erro inesperado ao forçar backup', 'error');
  }
}

async function restoreBackup(filename) {
  if (!confirm(`Restaurar backup ${filename}?\n\n⚠️ ATENÇÃO: O banco de dados atual será substituído e a página será recarregada.`)) return;
  
  console.log("🔄 Restaurando backup:", filename);
  try {
    const r = await api('/api/restore', { method: 'POST', body: { filename } });
    console.log("📦 Resposta da restauração:", r);
    
    // Nota: a rota de restore retorna "success" (em inglês) no server.js
    if (r && r.success) { 
      toast('Backup restaurado com sucesso! Recarregando...', 'success');
      console.log("⏳ Recarregando a página em 1.5 segundos...");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      toast(r?.error || 'Erro ao restaurar', 'error');
    }
  } catch (error) {
    console.error("❌ Erro na função restoreBackup:", error);
    toast('Erro inesperado ao restaurar', 'error');
  }
}

async function loadBackupStats() {
  const stats = await api('/api/backup-stats');
  if (!stats) return;
  
  const statsGrid = document.getElementById('backupStats');
  if (!statsGrid) return;
  
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="label">Total de Backups</div>
      <div class="value">${stats.totalBackups}</div>
    </div>
    <div class="stat-card success">
      <div class="label">Tamanho Total</div>
      <div class="value">${(stats.tamanhoTotal / 1024 / 1024).toFixed(2)} MB</div>
    </div>
    <div class="stat-card warning">
      <div class="label">Último Backup</div>
      <div class="value" style="font-size: 14px;">${stats.ultimoBackup ? new Date(stats.ultimoBackup).toLocaleString('pt-BR') : 'Nunca'}</div>
    </div>
    <div class="stat-card ${stats.automaticoAtivo ? 'success' : 'danger'}">
      <div class="label">Backup Automático</div>
      <div class="value" style="font-size: 18px;">${stats.automaticoAtivo ? '✅ Ativo' : '❌ Inativo'}</div>
    </div>
  `;
}

async function loadBackups() {
  console.log(' Carregando backups...');
  
  try {
    const backups = await api('/api/backups');
    console.log('📦 Backups recebidos:', backups);
    
    const tbody = document.getElementById('backupsTable');
    if (!tbody) {
      console.error('❌ Elemento backupsTable não encontrado!');
      return;
    }
    
    if (!backups || !Array.isArray(backups) || backups.length === 0) {
      console.log('⚠️ Nenhum backup encontrado');
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px;">Nenhum backup disponível</td></tr>';
      return;
    }
    
    console.log(`✅ ${backups.length} backup(s) encontrado(s)`);
    
    tbody.innerHTML = backups.map(b => {
      const tipoBadge = b.tipo === 'automático' ? 'badge-info' : b.tipo === 'forçado' ? 'badge-warning' : 'badge-success';
      const tamanho = b.size ? (b.size / 1024).toFixed(1) + ' KB' : '-';
      const data = b.date ? new Date(b.date).toLocaleString('pt-BR') : '-';
      
      return `
        <tr>
          <td><strong>${b.name}</strong></td>
          <td><span class="badge ${tipoBadge}">${b.tipo || 'manual'}</span></td>
          <td>${tamanho}</td>
          <td>${data}</td>
          <td>
            <a href="/api/backups/${b.name}/download" class="btn btn-primary btn-sm" target="_blank">📥 Download</a>
            <button class="btn btn-warning btn-sm" onclick="restoreBackup('${b.name}')">🔄 Restaurar</button>
            <button class="btn btn-danger btn-sm" onclick="deleteBackup('${b.name}')">🗑️ Excluir</button>
          </td>
        </tr>
      `;
    }).join('');
    
  } catch (error) {
    console.error(' Erro ao carregar backups:', error);
    const tbody = document.getElementById('backupsTable');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px; color: var(--danger);">Erro ao carregar backups</td></tr>';
    }
  }
}

async function restoreBackup(filename) {
  if (!confirm(`Restaurar backup ${filename}? O banco atual será substituído.`)) return;
  try {
    await api('/api/restore', { method: 'POST', body: { filename } });
    toast('Backup restaurado! Recarregando...', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteBackup(filename) {
  if (!confirm('Excluir este backup?')) return;
  try {
    await api(`/api/backups/${filename}`, { method: 'DELETE' });
    toast('Backup excluído', 'success');
    loadBackups();
    loadBackupStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function criarBackup() {
  const r = await api('/api/backup', { method: 'POST' });
  if (r) {
    toast(`Backup criado: ${r.filename}`, 'success');
    loadBackups();
  }
}

async function restoreBackup(filename) {
  if (!confirm(`Restaurar ${filename}?`)) return;
  try {
    await api('/api/restore', { method: 'POST', body: { filename } });
    toast('Backup restaurado! Recarregue...', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteBackup(filename) {
  if (!confirm('Excluir?')) return;
  try {
    await api(`/api/backups/${filename}`, { method: 'DELETE' });
    toast('Backup excluído', 'success');
    loadBackups();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// UTILS
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function formatDate(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function diasParaVencimento(data) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(data + 'T00:00:00');
  return Math.floor((venc - hoje) / (1000 * 60 * 60 * 24));
}

// Fechar modal clicando fora
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('active');
  });
});

// MOSTRAR/ESCONDER CAMPOS POR CATEGORIA
function toggleCamposCategoria() {
  const categoriaId = document.getElementById('prodCategoria')?.value;
  const categoria = categorias.find(c => c.id == categoriaId);
  
  const camposPermanente = document.getElementById('camposPermanente');
  const camposValidadeLote = document.getElementById('camposValidadeLote');
  
  if (!camposPermanente || !camposValidadeLote) return;
  
  if (categoria && categoria.tipo === 'permanente') {
    camposPermanente.style.display = 'block';
    camposValidadeLote.style.display = 'none';
    
    const prodValidade = document.getElementById('prodValidade');
    const prodLote = document.getElementById('prodLote');
    if (prodValidade) prodValidade.value = '';
    if (prodLote) prodLote.value = '';
  } else {
    camposPermanente.style.display = 'none';
    camposValidadeLote.style.display = 'block';
    
    const prodMarca = document.getElementById('prodMarca');
    const prodModelo = document.getElementById('prodModelo');
    const prodPatrimonio = document.getElementById('prodPatrimonio');
    if (prodMarca) prodMarca.value = '';
    if (prodModelo) prodModelo.value = '';
    if (prodPatrimonio) prodPatrimonio.value = '';
  }
}

// ============ ABRIR MODAL DE NOVO PRODUTO (CORRIGIDO) ============
function openProdutoModal() {
  const modalTitle = document.getElementById('modalProdutoTitle');
  const form = document.getElementById('formProduto');
  const prodId = document.getElementById('prodId');
  const prodQtd = document.getElementById('prodQtd');
  const prodQtdMin = document.getElementById('prodQtdMin');
  const prodUnidade = document.getElementById('prodUnidade');
  const modal = document.getElementById('modalProduto');

  if (modalTitle) modalTitle.textContent = 'Novo Produto';
  if (form) form.reset();
  if (prodId) prodId.value = '';
  if (prodQtd) prodQtd.value = '0';
  if (prodQtdMin) prodQtdMin.value = '0';
  if (prodUnidade) prodUnidade.value = 'UN';
  
  // ✅ CORREÇÃO: Removemos as linhas que forçavam a exibição errada.
  // Agora chamamos a função que verifica a categoria selecionada e ajusta os campos.
  if (typeof toggleCamposCategoria === 'function') {
    setTimeout(toggleCamposCategoria, 50); // Pequeno delay para garantir que o reset() terminou
  }
  
  if (modal) modal.classList.add('active');
}

// ============ EDITAR PRODUTO (CORRIGIDO) ============
function editProduto(id) {
  const p = produtos.find(x => x.id === id);
  if (!p) return;
  
  const modalTitle = document.getElementById('modalProdutoTitle');
  if (modalTitle) modalTitle.textContent = 'Editar Produto';
  
  const setVal = (elementId, value) => {
    const el = document.getElementById(elementId);
    if (el) el.value = value || '';
  };

  setVal('prodId', p.id);
  setVal('prodNome', p.nome);
  setVal('prodCategoria', p.categoria_id);
  setVal('prodUnidade', p.unidade || 'UN');
  setVal('prodQtd', p.quantidade || 0);
  setVal('prodQtdMin', p.quantidade_minima || 0);
  setVal('prodLocal', p.localizacao);
  setVal('prodMarca', p.marca);
  setVal('prodModel', p.modelo);
  setVal('prodPatrimonio', p.patrimonio);
  setVal('prodValidade', p.data_validade);
  setVal('prodLote', p.lote);
  
  // ✅ CORREÇÃO: Garante que os campos corretos apareçam ao editar
  if (typeof toggleCamposCategoria === 'function') {
    setTimeout(toggleCamposCategoria, 50);
  }
  
  const modal = document.getElementById('modalProduto');
  if (modal) modal.classList.add('active');
}
// DELETAR PRODUTO
async function deleteProduto(id) {
  if (!confirm('Excluir?')) return;
  try {
    await api(`/api/produtos/${id}`, { method: 'DELETE' });
    toast('Produto excluído', 'success');
    loadProdutos();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// SALVAR PRODUTO

async function saveProduto() {
  console.log('💾 [FRONTEND] Iniciando salvamento do produto...');
  
  const id = document.getElementById('prodId')?.value;
  const categoriaId = document.getElementById('prodCategoria')?.value;
  const categoria = categorias.find(c => c.id == categoriaId);
  
  const getVal = (elementId) => {
    const el = document.getElementById(elementId);
    return el ? el.value : null;
  };

  const data = {
    nome: getVal('prodNome'),
    categoria_id: categoriaId,
    unidade: getVal('prodUnidade') || 'UN',
    quantidade: parseInt(getVal('prodQtd')) || 0,
    quantidade_minima: parseInt(getVal('prodQtdMin')) || 0,
    localizacao: getVal('prodLocal'),
    data_validade: null,
    lote: null,
    marca: null,
    modelo: null,
    patrimonio: null
  };
  
  if (categoria && categoria.tipo === 'permanente') {
    data.marca = getVal('prodMarca') || null;
    data.modelo = getVal('prodModelo') || null;
    data.patrimonio = getVal('prodPatrimonio') || null;
  } else {
    data.data_validade = getVal('prodValidade') || null;
    data.lote = getVal('prodLote') || null;
  }
  
  if (!data.nome || !data.categoria_id) {
    toast('Preencha nome e categoria', 'error');
    return;
  }
  
  try {
    if (id && id !== '' && id !== 'undefined') {
      console.log(`✏️ Atualizando produto ID: ${id}`);
      const response = await api(`/api/produtos/${id}`, { method: 'PUT', body: data });
      console.log('📤 Resposta da API (PUT):', response);
      
      // Condição flexível: aceita se tiver 'id' OU se tiver 'success'
      if (response && (response.id !== undefined || response.success === true)) {
        toast('Produto atualizado com sucesso!', 'success');
        closeModal('modalProduto');
        loadProdutos();
      } else {
        console.warn('⚠️ Resposta inesperada na atualização:', response);
        toast('Erro ao atualizar produto', 'error');
      }
      
    } else {
      console.log('➕ Criando novo produto');
      const response = await api('/api/produtos', { method: 'POST', body: data });
      console.log('📤 Resposta da API (POST):', response);
      
      // CORREÇÃO PRINCIPAL: Aceita o sucesso se a resposta existir e não tiver propriedade 'error'
      // ou se tiver o 'id' (mesmo que seja 0, que é falsy em JS, mas válido no SQLite as vezes)
      if (response && !response.error) {
        toast('Produto cadastrado com sucesso!', 'success');
        closeModal('modalProduto'); // <-- Isso agora vai funcionar
        loadProdutos();             // <-- Isso vai atualizar a tabela na hora
      } else {
        console.error('❌ O servidor recusou o cadastro. Resposta:', response);
        toast('Erro ao cadastrar produto: ' + (response?.error || 'Verifique os dados'), 'error');
      }
    }
  } catch (e) {
    console.error('❌ Erro de rede ou sistema ao salvar produto:', e);
    toast('Erro ao salvar: ' + (e.message || 'Erro desconhecido'), 'error');
  }
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Adicionar listener para mudança de categoria no modal de produto
  const prodCategoria = document.getElementById('prodCategoria');
  if (prodCategoria) {
    prodCategoria.addEventListener('change', toggleCamposCategoria);
  }
});

// Verifica backup automático a cada 30 segundos
setInterval(async () => {
  try {
    const r = await fetch('/refresh.txt?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const novoSinal = await r.text();
      const sinalAntigo = localStorage.getItem('lastRefreshSignal');
      
      // Só recarrega se o sinal for DIFERENTE (novo backup)
      if (novoSinal && novoSinal !== sinalAntigo) {
        console.log('🔄 Novo backup detectado:', novoSinal);
        localStorage.setItem('lastRefreshSignal', novoSinal);
        
        // Aguarda 3 segundos antes de recarregar (garante que o servidor terminou tudo)
        setTimeout(() => {
          console.log('🔄 Recarregando página...');
          location.reload();
        }, 3000);
      }
    }
  } catch(e) {
    // Silencioso
  }
}, 30000); // Verifica a cada 30 segundos

// ============ DASHBOARD - FAIXAS DE VENCIMENTO ============
async function loadFaixasVencimento() {
  try {
    const produtos = await api('/api/produtos');
    if (!produtos) return;
    
    const faixas = {
      maior_120: produtos.filter(p => p.data_validade && diasParaVencimento(p.data_validade) > 120),
      ate_90: produtos.filter(p => p.data_validade && diasParaVencimento(p.data_validade) <= 90 && diasParaVencimento(p.data_validade) > 60),
      ate_60: produtos.filter(p => p.data_validade && diasParaVencimento(p.data_validade) <= 60 && diasParaVencimento(p.data_validade) > 30),
      ate_30: produtos.filter(p => p.data_validade && diasParaVencimento(p.data_validade) <= 30 && diasParaVencimento(p.data_validade) >= 0)
    };
    
    const elementos = {
      'countMaior120': faixas.maior_120.length,
      'countAte90': faixas.ate_90.length,
      'countAte60': faixas.ate_60.length,
      'countAte30': faixas.ate_30.length
    };
    
    Object.keys(elementos).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = elementos[id];
    });
    
    window.faixasVencimento = faixas;
    
  } catch (e) {
    console.error('Erro ao carregar faixas:', e);
  }
}

function verProdutosFaixa(faixa) {
  const faixas = window.faixasVencimento;
  if (!faixas) return;
  
  const titulos = {
    'maior_120': 'Produtos >120 dias (Longo prazo)',
    'ate_90': 'Produtos ≤90 dias (Atenção)',
    'ate_60': 'Produtos ≤60 dias (Urgente)',
    'ate_30': 'Produtos ≤30 dias (Crítico)'
  };
  
  const produtos = faixas[faixa] || [];
  
  document.getElementById('modalFaixaTitle').textContent = titulos[faixa];
  
  const tbody = document.getElementById('tabelaProdutosFaixa');
  tbody.innerHTML = produtos.length ? produtos.map(p => `
    <tr>
      <td><strong>${p.nome}</strong></td>
      <td>${p.categoria_nome || '-'}</td>
      <td>${p.lote || '-'}</td>
      <td>${formatDate(p.data_validade)}</td>
      <td><span class="badge ${diasParaVencimento(p.data_validade) <= 30 ? 'badge-danger' : diasParaVencimento(p.data_validade) <= 60 ? 'badge-warning' : 'badge-success'}">${diasParaVencimento(p.data_validade)} dias</span></td>
      <td>${p.quantidade} ${p.unidade}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="text-center" style="padding: 20px;">Nenhum produto</td></tr>';
  
  document.getElementById('modalProdutosFaixa').classList.add('active');
}

// ============ RELATÓRIOS ============
let tipoRelatorioAtual = null;

function selecionarRelatorio(tipo) {
  tipoRelatorioAtual = tipo;
  
  document.getElementById('cardRelProdutos').classList.toggle('active', tipo === 'produtos');
  document.getElementById('cardRelMovimentacoes').classList.toggle('active', tipo === 'movimentacoes');
  
  document.getElementById('filtrosRelatorio').style.display = 'block';
  
  if (tipo === 'movimentacoes') {
    document.getElementById('filtroDataInicio').style.display = 'block';
    document.getElementById('filtroDataFim').style.display = 'block';
    document.getElementById('filtroTipo').style.display = 'block';
  } else {
    document.getElementById('filtroDataInicio').style.display = 'none';
    document.getElementById('filtroDataFim').style.display = 'none';
    document.getElementById('filtroTipo').style.display = 'none';
  }
  
  loadCategoriasRelatorio();
  document.getElementById('resultadoRelatorio').style.display = 'none';
}

async function loadCategoriasRelatorio() {
  const cats = await api('/api/categorias');
  const select = document.getElementById('relCategoria');
  if (select && cats) {
    select.innerHTML = '<option value="todos">Todas as categorias</option>' +
      cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  }
}

function limparFiltros() {
  document.getElementById('relCategoria').value = 'todos';
  document.getElementById('relDataInicio').value = '';
  document.getElementById('relDataFim').value = '';
  document.getElementById('relTipo').value = 'todos';
  document.getElementById('resultadoRelatorio').style.display = 'none';
}

async function gerarRelatorio() {
  if (!tipoRelatorioAtual) {
    toast('Selecione o tipo de relatório', 'warning');
    return;
  }
  
  const categoria = document.getElementById('relCategoria').value;
  const dataInicio = document.getElementById('relDataInicio').value;
  const dataFim = document.getElementById('relDataFim').value;
  const tipo = document.getElementById('relTipo').value;
  
  try {
    let url = '';
    if (tipoRelatorioAtual === 'produtos') {
      url = `/api/relatorio/produtos?categoria_id=${categoria}`;
    } else {
      url = `/api/relatorio/movimentacoes?categoria_id=${categoria}`;
      if (dataInicio) url += `&data_inicio=${dataInicio}`;
      if (dataFim) url += `&data_fim=${dataFim}`;
      if (tipo !== 'todos') url += `&tipo=${tipo}`;
    }
    
    const dados = await api(url);
    if (!dados) return;
    
    document.getElementById('resultadoRelatorio').style.display = 'block';
    
    const titulo = tipoRelatorioAtual === 'produtos' ? 'Relatório de Produtos' : 'Relatório de Movimentações';
    document.getElementById('tituloRelatorio').textContent = titulo;
    
    let subtitulo = `Categoria: ${categoria === 'todos' ? 'Todas' : document.getElementById('relCategoria').options[document.getElementById('relCategoria').selectedIndex].text}`;
    if (dataInicio) subtitulo += ` | Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}`;
    document.getElementById('subtituloRelatorio').textContent = subtitulo;
    document.getElementById('dataGeracao').textContent = new Date().toLocaleString('pt-BR');
    
    const statsGrid = document.getElementById('statsRelatorio');
    if (tipoRelatorioAtual === 'produtos') {
      statsGrid.innerHTML = `
        <div class="stat-card"><div class="label">Total</div><div class="value">${dados.stats.total}</div></div>
        <div class="stat-card success"><div class="label">Com Estoque</div><div class="value">${dados.stats.com_estoque}</div></div>
        <div class="stat-card danger"><div class="label">Vencidos</div><div class="value">${dados.stats.vencidos}</div></div>
        <div class="stat-card warning"><div class="label">Críticos</div><div class="value">${dados.stats.criticos}</div></div>
      `;
    } else {
      statsGrid.innerHTML = `
        <div class="stat-card"><div class="label">Total</div><div class="value">${dados.stats.total}</div></div>
        <div class="stat-card success"><div class="label">Entradas</div><div class="value">${dados.stats.entradas}</div></div>
        <div class="stat-card warning"><div class="label">Saídas</div><div class="value">${dados.stats.saidas}</div></div>
        <div class="stat-card"><div class="label">Total Entradas (un)</div><div class="value">${dados.stats.total_entradas}</div></div>
      `;
    }
    
    const thead = document.getElementById('theadRelatorio');
    const tbody = document.getElementById('tbodyRelatorio');
    
    if (tipoRelatorioAtual === 'produtos') {
      thead.innerHTML = '<tr><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Un</th><th>Validade</th><th>Dias</th><th>Status</th></tr>';
      tbody.innerHTML = dados.produtos.map(p => `
        <tr>
          <td><strong>${p.nome}</strong>${p.marca ? `<br><small>${p.marca} ${p.modelo}</small>` : ''}${p.patrimonio ? `<br><small>Pat: ${p.patrimonio}</small>` : ''}</td>
          <td>${p.categoria_nome || '-'}</td>
          <td>${p.quantidade}</td>
          <td>${p.unidade}</td>
          <td>${p.data_validade ? formatDate(p.data_validade) : '-'}</td>
          <td>${p.dias_restantes !== null ? p.dias_restantes + ' dias' : '-'}</td>
          <td><span class="badge ${p.status.includes('Crítico') || p.status.includes('Vencido') ? 'badge-danger' : p.status.includes('Urgente') ? 'badge-warning' : p.status.includes('Atenção') ? 'badge-info' : 'badge-success'}">${p.status}</span></td>
        </tr>
      `).join('');
    } else {
      thead.innerHTML = '<tr><th>Data/Hora</th><th>Produto</th><th>Categoria</th><th>Tipo</th><th>Qtd</th><th>Motivo</th><th>Usuário</th></tr>';
      tbody.innerHTML = dados.movimentacoes.map(m => `
        <tr>
          <td>${new Date(m.data_movimentacao).toLocaleString('pt-BR')}</td>
          <td><strong>${m.produto_nome}</strong></td>
          <td>${m.categoria_nome || '-'}</td>
          <td><span class="badge ${m.tipo === 'entrada' ? 'badge-success' : 'badge-warning'}">${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
          <td>${m.quantidade}</td>
          <td>${m.motivo || '-'}</td>
          <td>${m.usuario_nome || '-'}</td>
        </tr>
      `).join('');
    }
    
    document.getElementById('resultadoRelatorio').scrollIntoView({ behavior: 'smooth' });
    
  } catch (e) {
    console.error('Erro ao gerar relatório:', e);
    toast('Erro ao gerar relatório', 'error');
  }
}

// Atualiza loadPage para incluir relatórios
const loadPageOriginal = loadPage;
loadPage = function(page) {
  if (page === 'relatorios') return;
  if (loadPageOriginal) loadPageOriginal(page);
};

// Atualiza loadDashboard para incluir faixas
const loadDashboardOriginal = loadDashboard;
loadDashboard = async function() {
  if (loadDashboardOriginal) await loadDashboardOriginal();
  await loadFaixasVencimento();
};

// ============ MODO OFFLINE & MENU MOBILE ============

// 1. Menu Mobile
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

if (menuToggle && sidebar) {
  function checkScreenSize() {
    if (window.innerWidth <= 768) {
      menuToggle.style.display = 'block';
    } else {
      menuToggle.style.display = 'none';
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    }
  }
  checkScreenSize();
  window.addEventListener('resize', checkScreenSize);

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
  });

  sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      }
    });
  });
}

// 2. Sistema de Fila Offline
const OFFLINE_QUEUE_KEY = 'offline_queue_produtos';

async function saveProdutoOffline(data) {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  queue.push({
    ...data,
    _idTemp: Date.now(),
    _createdAt: new Date().toISOString()
  });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  toast('⚠️ Salvo offline! Será enviado quando voltar a internet.', 'warning');
  closeModal('modalProduto');
  loadProdutos(); // Atualiza a tabela localmente se quiser
}

window.sincronizarDadosOffline = async function() {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  toast(`🔄 Sincronizando ${queue.length} item(ns)...`, 'info');
  let sucesso = 0;

  for (const item of queue) {
    try {
      const { _idTemp, _createdAt, ...dadosReais } = item;
      await api('/api/produtos', { method: 'POST', body: dadosReais });
      sucesso++;
    } catch (e) {
      console.error('Erro ao sincronizar item:', e);
    }
  }

  if (sucesso > 0) {
    // Remove os itens que deram certo da fila
    const novaFila = queue.filter(item => {
       // Lógica simples: limpa tudo se a maioria foi, ou refina depois
       return false; 
    });
    // Para simplificar, se sincronizou, limpa a fila toda (pode ser refinado depois)
    localStorage.setItem(OFFLINE_QUEUE_KEY, '[]');
    toast(`✅ ${sucesso} item(ns) sincronizado(s)!`, 'success');
    loadProdutos();
  }
};

// 3. Sobrescrever saveProduto para checar internet
const saveProdutoOriginal = saveProduto;
saveProduto = async function() {
  if (!navigator.onLine) {
    const categoriaId = document.getElementById('prodCategoria')?.value;
    const getVal = (id) => document.getElementById(id)?.value || null;
    
    const data = {
      nome: getVal('prodNome'),
      categoria_id: categoriaId,
      unidade: getVal('prodUnidade') || 'UN',
      quantidade: parseInt(getVal('prodQtd')) || 0,
      quantidade_minima: parseInt(getVal('prodQtdMin')) || 0,
      localizacao: getVal('prodLocal'),
      data_validade: getVal('prodValidade'),
      lote: getVal('prodLote'),
      marca: getVal('prodMarca'),
      modelo: getVal('prodModelo'),
      patrimonio: getVal('prodPatrimonio')
    };

    if (!data.nome || !data.categoria_id) {
      toast('Preencha nome e categoria', 'error');
      return;
    }
    await saveProdutoOffline(data);
    return;
  }
  // Se estiver online, usa a função original
  await saveProdutoOriginal();
};

// Tenta sincronizar ao carregar a página
if (navigator.onLine) {
  setTimeout(() => {
    if(window.sincronizarDadosOffline) window.sincronizarDadosOffline();
  }, 2000);
}

// ============ TOGGLE SENHA NO LOGIN (Versão Simplificada) ============
(function() {
  const toggleBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('loginPass');
  const eyeIcon = document.getElementById('eyeIcon');
  
  if (!toggleBtn || !passwordInput || !eyeIcon) {
    console.log('⚠️ Elementos do toggle não encontrados');
    return;
  }
  
  // SVG do olho aberto
  const eyeOpenSVG = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
  
  // SVG do olho fechado
  const eyeClosedSVG = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
  
  let isPasswordVisible = false;
  
  function togglePassword() {
    isPasswordVisible = !isPasswordVisible;
    
    // Alterna tipo do input
    passwordInput.type = isPasswordVisible ? 'text' : 'password';
    
    // Alterna ícone
    eyeIcon.innerHTML = isPasswordVisible ? eyeClosedSVG : eyeOpenSVG;
    
    console.log('Senha:', isPasswordVisible ? 'visível' : 'oculta');
  }
  
  // Eventos
  toggleBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    togglePassword();
  });
  
  toggleBtn.addEventListener('touchend', function(e) {
    e.preventDefault();
    e.stopPropagation();
    togglePassword();
  });
  
  toggleBtn.addEventListener('mousedown', function(e) {
    e.preventDefault();
  });
  
  console.log('✅ Toggle de senha inicializado');
})();

// ============ ATUALIZAR CAMPOS POR CATEGORIA ============
function atualizarCamposPorCategoria() {
  const categoriaId = document.getElementById('prodCategoria')?.value;
  const categoria = categorias.find(c => c.id == categoriaId);
  
  if (!categoria) return;
  
  // IDs dos campos
  const camposConsumo = ['prodValidade', 'prodLote', 'prodLocal'];
  const camposPermanente = ['prodMarca', 'prodModelo', 'prodPatrimonio'];
  
  if (categoria.tipo === 'permanente') {
    // Material Permanente: mostra marca, modelo, patrimônio
    camposPermanente.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.closest('.form-group')) {
        el.closest('.form-group').style.display = 'block';
      }
    });
    camposConsumo.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.closest('.form-group')) {
        el.closest('.form-group').style.display = 'none';
      }
    });
  } else {
    // Material de Consumo: mostra validade, lote, localização
    camposConsumo.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.closest('.form-group')) {
        el.closest('.form-group').style.display = 'block';
      }
    });
    camposPermanente.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.closest('.form-group')) {
        el.closest('.form-group').style.display = 'none';
      }
    });
  }
}