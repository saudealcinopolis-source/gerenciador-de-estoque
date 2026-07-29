const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sistema-estoque-secret-key-2024';
const DB_PATH = './database/estoque.db';
const BACKUP_CONFIG_PATH = './database/backup-config.json';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync('./database')) fs.mkdirSync('./database');
if (!fs.existsSync('./backups')) fs.mkdirSync('./backups');

let db;

// ============ HELPERS SQL.JS ============
function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  if (params.length > 0) {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
  } else {
    db.run(sql);
  }
  saveDB();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function all(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (error) {
    console.error('❌ ERRO CRÍTICO NO BANCO (função all):', error.message);
    console.error('📝 SQL:', sql);
    console.error('📝 PARAMS:', params);
    throw error;
  }
}

function lastId() {
  const r = get('SELECT last_insert_rowid() as id');
  return r ? r.id : 0;
}

// ============ CONFIGURAÇÃO DE BACKUP AUTOMÁTICO ============
let backupConfig = {
  automatico: false,
  frequencia: 'diario',
  horario: '02:00',
  reter: 10,
  inteligente: true,
  ultimoBackup: null,
  ultimoHash: null
};

if (fs.existsSync(BACKUP_CONFIG_PATH)) {
  try {
    backupConfig = JSON.parse(fs.readFileSync(BACKUP_CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.log('⚠️ Config de backup corrompida, usando padrão');
  }
}

function saveBackupConfig() {
  fs.writeFileSync(BACKUP_CONFIG_PATH, JSON.stringify(backupConfig, null, 2));
}

function getDBHash() {
  const data = db.export();
  return crypto.createHash('md5').update(Buffer.from(data)).digest('hex');
}

function criarBackupInteligente(motivo = 'manual', forcar = false) {
  const currentHash = getDBHash();
  
  // Só pula se for automático e não tiver alterações
  // Backup manual SEMPRE é criado
  if (motivo === 'automatico' && backupConfig.inteligente && !forcar && currentHash === backupConfig.ultimoHash) {
    console.log('💾 Backup automático inteligente: nenhuma alteração, pulando');
    return { sucesso: false, motivo: 'sem_alteracoes' };
  }
  
  console.log(`🔵 Criando backup ${motivo}... (forcar: ${forcar})`);
  
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
  const filename = `backup_${dateStr}_${timeStr}_${motivo}.db`;
  const backupPath = path.join(__dirname, 'backups', filename);
  
  console.log('📝 Nome do arquivo de backup:', filename); // DEBUG
  console.log('📝 Caminho completo:', backupPath); // DEBUG
  
  try {
    const data = db.export();
    fs.writeFileSync(backupPath, Buffer.from(data));
    
    backupConfig.ultimoBackup = date.toISOString();
    backupConfig.ultimoHash = currentHash;
    saveBackupConfig();
    
    // Reter apenas os N mais recentes
    const files = fs.readdirSync('./backups')
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, date: fs.statSync(path.join('./backups', f)).mtime }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    while (files.length > backupConfig.reter) {
      const old = files.pop();
      fs.unlinkSync(path.join('./backups', old.name));
      console.log(`🗑️ Backup antigo removido: ${old.name}`);
    }
    
    console.log(`✅ Backup criado com sucesso: ${filename}`);
    
    // RETORNO EXPLÍCITO COM TODOS OS CAMPOS
    return { 
      sucesso: true,
      filename: filename,
      nome: filename,  // Adiciona campo alternativo
      tamanho: data.length,
      mensagem: `Backup criado: ${filename}`
    };
    
  } catch (e) {
    console.error('❌ Erro ao criar backup:', e);
    return { 
      sucesso: false, 
      erro: e.message,
      mensagem: 'Erro ao criar backup'
    };
  }
}

let backupInterval = null;

function iniciarBackupAutomatico() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
  if (!backupConfig.automatico) return;
  
  console.log(`⏰ Backup automático ativado: ${backupConfig.frequencia} às ${backupConfig.horario}`);
  
  backupInterval = setInterval(() => {
    const agora = new Date();
    const [hora, minuto] = backupConfig.horario.split(':').map(Number);
    
    if (agora.getHours() === hora && agora.getMinutes() === minuto) {
      console.log('⏰ Executando backup automático agendado...');
      
      // 1. CRIA O BACKUP PRIMEIRO
      const resultado = criarBackupInteligente('automatico');
      
      // 2. SÓ ENVIA O SINAL SE O BACKUP FOI CONCLUÍDO COM SUCESSO
      if (resultado.sucesso) {
        // Aguarda 2 segundos para garantir que o arquivo foi totalmente gravado
        setTimeout(() => {
          try {
            const fs = require('fs');
            const path = require('path');
            const refreshPath = path.join(__dirname, 'public', 'refresh.txt');
            
            // Usa o nome do arquivo de backup como sinal (garante que é único)
            const sinal = resultado.filename + '_' + Date.now();
            fs.writeFileSync(refreshPath, sinal);
            
            console.log(`✅ Sinal de refresh enviado APÓS backup: ${resultado.filename}`);
          } catch(e) {
            console.log('️ Erro ao criar sinal de refresh:', e.message);
          }
        }, 2000); // Delay de 2 segundos após o backup
      }
    }
  }, 60 * 1000);
}

// ============ INICIALIZAÇÃO ============
async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nome TEXT NOT NULL,
    perfil TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    tipo TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria_id INTEGER,
    unidade TEXT DEFAULT 'UN',
    quantidade INTEGER DEFAULT 0,
    quantidade_minima INTEGER DEFAULT 0,
    data_validade DATE,
    lote TEXT,
    localizacao TEXT,
    marca TEXT,
    modelo TEXT,
    patrimonio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    motivo TEXT,
    usuario_id INTEGER,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  saveDB();

  const admin = get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    run('INSERT INTO users (username, password, nome, perfil) VALUES (?, ?, ?, ?)',
      ['admin', hash, 'Administrador Geral', 'admin']);
    console.log('✅ Admin criado: admin / admin123');
  }

  const catCount = get('SELECT COUNT(*) as c FROM categorias');
  if (catCount.c === 0) {
    run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', ['Material Permanente', 'permanente']);
    run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', ['Material de Limpeza', 'limpeza']);
    run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', ['Gênero Alimentício', 'alimento']);
    run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', ['Material de Expediente', 'expediente']);
    run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', ['Gás', 'gas']);
    run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', ['Material de Informática', 'informatica']);
    console.log('✅ Categorias criadas');
  }

  console.log('✅ Banco de dados inicializado');
}

// ============ MIDDLEWARE AUTH ============
function authMiddleware(requiredProfiles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredProfiles.length && !requiredProfiles.includes(decoded.perfil)) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
      req.user = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  };
}

// ============ ROTAS DE AUTENTICAÇÃO ============
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = get('SELECT * FROM users WHERE username = ? AND ativo = 1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, perfil: user.perfil, nome: user.nome },
    JWT_SECRET, { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, perfil: user.perfil, nome: user.nome } });
});

// ============ USUÁRIOS ============
app.get('/api/users', authMiddleware(['admin']), (req, res) => {
  res.json(all('SELECT id, username, nome, perfil, ativo, created_at FROM users'));
});

app.post('/api/users', authMiddleware(['admin']), (req, res) => {
  const { username, password, nome, perfil } = req.body;
  if (!['admin', 'gestor', 'usuario'].includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (username, password, nome, perfil) VALUES (?, ?, ?, ?)', [username, hash, nome, perfil]);
    const user = get('SELECT id FROM users WHERE username = ?', [username]);
    res.json({ id: user.id, username, nome, perfil });
  } catch (e) {
    res.status(400).json({ error: 'Usuário já existe' });
  }
});

app.put('/api/users/:id', authMiddleware(['admin']), (req, res) => {
  const { nome, perfil, ativo, password } = req.body;
  const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    run('UPDATE users SET nome=?, perfil=?, ativo=?, password=? WHERE id=?', [nome || user.nome, perfil || user.perfil, ativo ?? user.ativo, hash, req.params.id]);
  } else {
    run('UPDATE users SET nome=?, perfil=?, ativo=? WHERE id=?', [nome || user.nome, perfil || user.perfil, ativo ?? user.ativo, req.params.id]);
  }
  res.json({ success: true });
});

app.delete('/api/users/:id', authMiddleware(['admin']), (req, res) => {
  run('UPDATE users SET ativo = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ============ CATEGORIAS ============
app.get('/api/categorias', authMiddleware(), (req, res) => {
  res.json(all('SELECT * FROM categorias'));
});

// ============ PRODUTOS ============
app.get('/api/produtos', authMiddleware(), (req, res) => {
  res.json(all(`SELECT p.*, c.nome as categoria_nome, c.tipo as categoria_tipo FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.nome`));
});

app.get('/api/produtos/vencendo', authMiddleware(), (req, res) => {
  const dias = parseInt(req.query.dias || 10);
  res.json(all(`SELECT p.*, c.nome as categoria_nome, c.tipo as categoria_tipo, CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE data_validade IS NOT NULL AND data_validade <= date('now', '+${dias} days') AND data_validade >= date('now') ORDER BY data_validade ASC`));
});

app.get('/api/produtos/vencidos', authMiddleware(), (req, res) => {
  res.json(all(`SELECT p.*, c.nome as categoria_nome, c.tipo as categoria_tipo, CAST(julianday('now') - julianday(data_validade) AS INTEGER) as dias_vencido FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE data_validade IS NOT NULL AND data_validade < date('now') ORDER BY data_validade ASC`));
});

app.post('/api/produtos', authMiddleware(['admin', 'gestor']), (req, res) => {
  const { nome, categoria_id, unidade, quantidade, quantidade_minima, data_validade, lote, localizacao, marca, modelo, patrimonio } = req.body;
  run(`INSERT INTO produtos (nome, categoria_id, unidade, quantidade, quantidade_minima, data_validade, lote, localizacao, marca, modelo, patrimonio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nome, categoria_id, unidade || 'UN', quantidade || 0, quantidade_minima || 0, data_validade, lote, localizacao, marca, modelo, patrimonio]);
  res.json({ id: lastId() });
});

app.put('/api/produtos/:id', authMiddleware(['admin', 'gestor']), (req, res) => {
  const { nome, categoria_id, unidade, quantidade, quantidade_minima, data_validade, lote, localizacao, marca, modelo, patrimonio } = req.body;
  
  console.log('✏️ Atualizando produto:', req.params.id);
  console.log(' Dados recebidos:', req.body);
  
  run(`UPDATE produtos SET nome=?, categoria_id=?, unidade=?, quantidade=?, quantidade_minima=?, data_validade=?, lote=?, localizacao=?, marca=?, modelo=?, patrimonio=?
    WHERE id=?`,
    [nome, categoria_id, unidade, quantidade, quantidade_minima, data_validade, lote, localizacao, marca, modelo, patrimonio, req.params.id]);
  
  console.log('✅ Produto atualizado no banco');
  res.json({ success: true });
});

app.delete('/api/produtos/:id', authMiddleware(['admin']), (req, res) => {
  run('DELETE FROM produtos WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ============ MOVIMENTAÇÕES ============
app.post('/api/movimentacoes', authMiddleware(['admin', 'gestor', 'usuario']), (req, res) => {
  const { produto_id, tipo, quantidade, motivo } = req.body;
  if (!['entrada', 'saida'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  if (req.user.perfil === 'usuario' && tipo !== 'saida') return res.status(403).json({ error: 'Você só pode dar baixa (saída)' });

  const produto = get('SELECT * FROM produtos WHERE id = ?', [produto_id]);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  if (tipo === 'saida' && produto.quantidade < quantidade) return res.status(400).json({ error: 'Estoque insuficiente' });

  const novaQuantidade = tipo === 'entrada' ? produto.quantidade + quantidade : produto.quantidade - quantidade;
  run('UPDATE produtos SET quantidade = ? WHERE id = ?', [novaQuantidade, produto_id]);
  run(`INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, usuario_id) VALUES (?, ?, ?, ?, ?)`, [produto_id, tipo, quantidade, motivo, req.user.id]);
  res.json({ success: true, novaQuantidade });
});

app.get('/api/movimentacoes', authMiddleware(), (req, res) => {
  const sql = `
    SELECT m.*, 
           COALESCE(p.nome, 'Produto Excluído') as produto_nome, 
           p.categoria_id, 
           c.nome as categoria_nome,
           u.nome as usuario_nome
    FROM movimentacoes m
    LEFT JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    LEFT JOIN users u ON m.usuario_id = u.id
    ORDER BY m.data_movimentacao DESC 
    LIMIT 500
  `;
  
  const movimentacoes = all(sql);
  res.json(movimentacoes);
});

// ============ ROTAS NOTIFICAÇÕES E DASHBOARD ============
app.get('/api/notificacoes', authMiddleware(), (req, res) => {
  const vencendo = all(`SELECT p.id, p.nome, p.data_validade, p.categoria_id, CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes FROM produtos p WHERE data_validade IS NOT NULL AND data_validade <= date('now', '+10 days') AND data_validade >= date('now')`);
  const vencidos = all(`SELECT p.id, p.nome, p.data_validade, p.categoria_id, CAST(julianday('now') - julianday(data_validade) AS INTEGER) as dias_vencido FROM produtos p WHERE data_validade IS NOT NULL AND data_validade < date('now')`);
  const estoqueBaixo = all(`SELECT id, nome, quantidade, quantidade_minima FROM produtos WHERE quantidade <= quantidade_minima AND quantidade_minima > 0`);
  res.json({ vencendo, vencidos, estoqueBaixo });
});

app.get('/api/dashboard', authMiddleware(), (req, res) => {
  res.json({
    totalProdutos: get('SELECT COUNT(*) as c FROM produtos').c,
    totalItens: get('SELECT COALESCE(SUM(quantidade),0) as c FROM produtos').c,
    vencendo10: get(`SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade <= date('now', '+10 days') AND data_validade >= date('now')`).c,
    vencidos: get(`SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade < date('now')`).c,
    estoqueBaixo: get(`SELECT COUNT(*) as c FROM produtos WHERE quantidade <= quantidade_minima AND quantidade_minima > 0`).c
  });
});
// ============ RELATÓRIOS AVANÇADOS ============

// Produtos por faixa de vencimento
app.get('/api/produtos/faixas-vencimento', authMiddleware(), (req, res) => {
  const produtos = all(`
    SELECT p.*, c.nome as categoria_nome, c.tipo as categoria_tipo,
           CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes
    FROM produtos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.data_validade IS NOT NULL AND p.quantidade > 0
  `);
  
  const faixas = {
    maior_120: [],
    ate_90: [],
    ate_60: [],
    ate_30: [],
    vencidos: [],
    sem_validade: []
  };
  
  produtos.forEach(p => {
    if (p.dias_restantes < 0) {
      faixas.vencidos.push(p);
    } else if (p.dias_restantes <= 30) {
      faixas.ate_30.push(p);
    } else if (p.dias_restantes <= 60) {
      faixas.ate_60.push(p);
    } else if (p.dias_restantes <= 90) {
      faixas.ate_90.push(p);
    } else if (p.dias_restantes > 120) {
      faixas.maior_120.push(p);
    }
  });
  
  res.json(faixas);
});

app.get('/api/relatorio/movimentacoes', authMiddleware(), (req, res) => {
  try {
    console.log('🔍 Recebendo requisição de relatório:', req.query);
    
    const { categoria_id, data_inicio, data_fim, tipo } = req.query;
    
    let sql = `
      SELECT m.id, m.tipo, m.quantidade, m.motivo, m.data_movimentacao,
             p.nome as produto_nome, c.nome as categoria_nome, u.nome as usuario_nome
      FROM movimentacoes m
      LEFT JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN users u ON m.usuario_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (categoria_id && categoria_id !== 'todos') {
      sql += ' AND p.categoria_id = ?';
      params.push(categoria_id);
    }
    if (data_inicio) {
      sql += ' AND DATE(m.data_movimentacao) >= DATE(?)';
      params.push(data_inicio);
    }
    if (data_fim) {
      sql += ' AND DATE(m.data_movimentacao) <= DATE(?)';
      params.push(data_fim);
    }
    if (tipo && tipo !== 'todos') {
      sql += ' AND m.tipo = ?';
      params.push(tipo);
    }
    
    sql += ' ORDER BY m.data_movimentacao DESC';
    
    
    // Usa a função all() que já existe no seu código
    const movimentacoes = all(sql, params);
    
    const stats = {
      total: movimentacoes.length,
      entradas: movimentacoes.filter(m => m.tipo === 'entrada').length,
      saidas: movimentacoes.filter(m => m.tipo === 'saida').length,
      total_entradas: movimentacoes.filter(m => m.tipo === 'entrada').reduce((acc, m) => acc + (m.quantidade || 0), 0),
      total_saidas: movimentacoes.filter(m => m.tipo === 'saida').reduce((acc, m) => acc + (m.quantidade || 0), 0)
    };
    
    res.json({ movimentacoes, stats });
    
  } catch (error) {
    console.error('❌ ERRO NA ROTA DE MOVIMENTAÇÕES:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resumo de movimentações
app.get('/api/relatorio/movimentacoes/resumo', authMiddleware(), (req, res) => {
  const resumo = {
    total_entradas: get('SELECT COUNT(*) as c FROM movimentacoes WHERE tipo = "entrada"').c,
    total_saidas: get('SELECT COUNT(*) as c FROM movimentacoes WHERE tipo = "saida"').c,
    valor_total_entradas: get('SELECT SUM(quantidade) as s FROM movimentacoes WHERE tipo = "entrada"').s || 0,
    valor_total_saidas: get('SELECT SUM(quantidade) as s FROM movimentacoes WHERE tipo = "saida"').s || 0,
    por_categoria: all(`
      SELECT c.nome, COUNT(m.id) as total_movimentacoes,
             SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) as total_entradas,
             SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) as total_saidas
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      GROUP BY c.id, c.nome
      ORDER BY total_movimentacoes DESC
    `)
  };
  
  res.json(resumo);
});

/// ============ RELATÓRIOS ============
// Relatório de produtos
app.get('/api/relatorio/produtos', authMiddleware(), (req, res) => {
  const { categoria_id } = req.query;
  
  let sql = `
    SELECT p.*, c.nome as categoria_nome,
           CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes,
           CASE 
             WHEN p.data_validade IS NULL THEN 'Sem validade'
             WHEN julianday(p.data_validade) < julianday('now') THEN 'Vencido'
             WHEN julianday(p.data_validade) - julianday('now') <= 30 THEN 'Crítico (≤30 dias)'
             WHEN julianday(p.data_validade) - julianday('now') <= 60 THEN 'Urgente (≤60 dias)'
             WHEN julianday(p.data_validade) - julianday('now') <= 90 THEN 'Atenção (≤90 dias)'
             ELSE 'OK (>90 dias)'
           END as status
    FROM produtos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (categoria_id && categoria_id !== 'todos') {
    sql += ' AND p.categoria_id = ?';
    params.push(categoria_id);
  }
  
  sql += ' ORDER BY c.nome, p.nome';
  
  // USA A FUNÇÃO HELPER all() EM VEZ DE stmt.all()
  const produtos = all(sql, params);
  
  const stats = {
    total: produtos.length,
    com_estoque: produtos.filter(p => p.quantidade > 0).length,
    vencidos: produtos.filter(p => p.dias_restantes < 0).length,
    criticos: produtos.filter(p => p.dias_restantes >= 0 && p.dias_restantes <= 30).length,
    urgentes: produtos.filter(p => p.dias_restantes > 30 && p.dias_restantes <= 60).length,
    atencao: produtos.filter(p => p.dias_restantes > 60 && p.dias_restantes <= 90).length,
    ok: produtos.filter(p => p.dias_restantes > 90 || p.data_validade === null).length
  };
  
  res.json({ produtos, stats });
});

// Estatísticas gerais avançadas
app.get('/api/relatorio/estatisticas', authMiddleware(), (req, res) => {
  const estatisticas = {
    produtos: {
      total: get('SELECT COUNT(*) as c FROM produtos').c,
      com_estoque: get('SELECT COUNT(*) as c FROM produtos WHERE quantidade > 0').c,
      sem_estoque: get('SELECT COUNT(*) as c FROM produtos WHERE quantidade = 0').c,
      estoque_baixo: get('SELECT COUNT(*) as c FROM produtos WHERE quantidade <= quantidade_minima AND quantidade_minima > 0').c
    },
    validade: {
      vencidos: get('SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade < date("now")').c,
      vence_30_dias: get('SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade BETWEEN date("now") AND date("now", "+30 days")').c,
      vence_60_dias: get('SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade BETWEEN date("now", "+30 days") AND date("now", "+60 days")').c,
      vence_90_dias: get('SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade BETWEEN date("now", "+60 days") AND date("now", "+90 days")').c,
      maior_120_dias: get('SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL AND data_validade > date("now", "+120 days")').c,
      sem_validade: get('SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NULL').c
    },
    movimentacoes: {
      total_hoje: get('SELECT COUNT(*) as c FROM movimentacoes WHERE DATE(data_movimentacao) = DATE("now")').c,
      total_semana: get('SELECT COUNT(*) as c FROM movimentacoes WHERE DATE(data_movimentacao) >= DATE("now", "-7 days")').c,
      total_mes: get('SELECT COUNT(*) as c FROM movimentacoes WHERE DATE(data_movimentacao) >= DATE("now", "-30 days")').c
    }
  };
  
  res.json(estatisticas);
});
// ============ ROTAS DE BACKUP ============
app.get('/api/backup-config', authMiddleware(['admin']), (req, res) => {
  res.json(backupConfig);
});

app.put('/api/backup-config', authMiddleware(['admin']), (req, res) => {
  const { automatico, frequencia, horario, reter, inteligente } = req.body;
  backupConfig = {
    ...backupConfig,
    automatico: automatico ?? backupConfig.automatico,
    frequencia: frequencia ?? backupConfig.frequencia,
    horario: horario ?? backupConfig.horario,
    reter: reter ?? backupConfig.reter,
    inteligente: inteligente ?? backupConfig.inteligente
  };
  saveBackupConfig();
  if (backupConfig.automatico) iniciarBackupAutomatico();
  else if (backupInterval) { clearInterval(backupInterval); backupInterval = null; }
  res.json({ success: true, config: backupConfig });
});

app.post('/api/backup', authMiddleware(['admin']), (req, res) => {
  console.log('🔵 Rota /api/backup chamada');
  console.log('🔵 req.body:', req.body);
  
  const { forcar = false } = req.body;
  const resultado = criarBackupInteligente('manual', forcar);
  
  console.log('🟢 Resultado do backup:', resultado);
  
  res.json(resultado);
});

app.post('/api/backup/forcar', authMiddleware(['admin']), (req, res) => {
  res.json(criarBackupInteligente('forcado', true));
});

app.get('/api/backups', authMiddleware(['admin']), (req, res) => {
  const files = fs.readdirSync('./backups')
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const filePath = path.join('./backups', f);
      const stats = fs.statSync(filePath);
      return {
        name: f,
        size: stats.size,
        date: stats.mtime,
        tipo: f.includes('automatico') ? 'automático' : f.includes('forcado') ? 'forçado' : 'manual'
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(files);
});

app.post('/api/restore', authMiddleware(['admin']), async (req, res) => {
  const { filename } = req.body;
  const backupPath = path.join(__dirname, 'backups', filename);
  if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup não encontrado' });
  try {
    const fileBuffer = fs.readFileSync(backupPath);
    const SQL = await initSqlJs();
    db = new SQL.Database(fileBuffer);
    saveDB();
    res.json({ success: true, message: 'Restaurado com sucesso!' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao restaurar' });
  }
});

app.delete('/api/backups/:filename', authMiddleware(['admin']), (req, res) => {
  const filePath = path.join(__dirname, 'backups', req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.get('/api/backups/:filename/download', authMiddleware(['admin']), (req, res) => {
  const filePath = path.join(__dirname, 'backups', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Não encontrado' });
  res.download(filePath);
});

app.get('/api/backup-stats', authMiddleware(['admin']), (req, res) => {
  const files = fs.readdirSync('./backups').filter(f => f.endsWith('.db'));
  const totalSize = files.reduce((acc, f) => acc + fs.statSync(path.join('./backups', f)).size, 0);
  res.json({
    totalBackups: files.length,
    tamanhoTotal: totalSize,
    ultimoBackup: backupConfig.ultimoBackup,
    automaticoAtivo: backupConfig.automatico
  });
});


// ============ RELATÓRIOS ============

// Relatório de produtos
app.get('/api/relatorio/produtos', authMiddleware(), (req, res) => {
  try {
    const { categoria_id } = req.query;
    
    let sql = `
      SELECT p.*, c.nome as categoria_nome,
             CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes,
             CASE 
               WHEN p.data_validade IS NULL THEN 'Sem validade'
               WHEN julianday(p.data_validade) < julianday('now') THEN 'Vencido'
               WHEN julianday(p.data_validade) - julianday('now') <= 30 THEN 'Crítico (≤30 dias)'
               WHEN julianday(p.data_validade) - julianday('now') <= 60 THEN 'Urgente (≤60 dias)'
               WHEN julianday(p.data_validade) - julianday('now') <= 90 THEN 'Atenção (≤90 dias)'
               ELSE 'OK (>90 dias)'
             END as status
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    if (categoria_id && categoria_id !== 'todos') {
      sql += ' AND p.categoria_id = ?';
      params.push(categoria_id);
    }
    sql += ' ORDER BY c.nome, p.nome';
    
    // ✅ CORRETO: Usa a função helper all(), NÃO stmt.all()
    const produtos = all(sql, params);
    
    const stats = {
      total: produtos.length,
      com_estoque: produtos.filter(p => p.quantidade > 0).length,
      vencidos: produtos.filter(p => p.dias_restantes !== null && p.dias_restantes < 0).length,
      criticos: produtos.filter(p => p.dias_restantes !== null && p.dias_restantes >= 0 && p.dias_restantes <= 30).length,
      urgentes: produtos.filter(p => p.dias_restantes !== null && p.dias_restantes > 30 && p.dias_restantes <= 60).length,
      atencao: produtos.filter(p => p.dias_restantes !== null && p.dias_restantes > 60 && p.dias_restantes <= 90).length,
      ok: produtos.filter(p => p.dias_restantes === null || p.dias_restantes > 90).length
    };
    
    res.json({ produtos, stats });
  } catch (error) {
    console.error('❌ ERRO RELATÓRIO PRODUTOS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Relatório de movimentações
app.get('/api/relatorio/movimentacoes', authMiddleware(), (req, res) => {
  try {
    const { categoria_id, data_inicio, data_fim, tipo } = req.query;
    
    let sql = `
      SELECT m.id, m.tipo, m.quantidade, m.motivo, m.data_movimentacao,
             p.nome as produto_nome, c.nome as categoria_nome, u.nome as usuario_nome
      FROM movimentacoes m
      LEFT JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN users u ON m.usuario_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    if (categoria_id && categoria_id !== 'todos') {
      sql += ' AND p.categoria_id = ?';
      params.push(categoria_id);
    }
    if (data_inicio) {
      sql += ' AND DATE(m.data_movimentacao) >= DATE(?)';
      params.push(data_inicio);
    }
    if (data_fim) {
      sql += ' AND DATE(m.data_movimentacao) <= DATE(?)';
      params.push(data_fim);
    }
    if (tipo && tipo !== 'todos') {
      sql += ' AND m.tipo = ?';
      params.push(tipo);
    }
    sql += ' ORDER BY m.data_movimentacao DESC';
    
    // ✅ CORRETO: Usa a função helper all(), NÃO stmt.all()
    const movimentacoes = all(sql, params);
    
    const stats = {
      total: movimentacoes.length,
      entradas: movimentacoes.filter(m => m.tipo === 'entrada').length,
      saidas: movimentacoes.filter(m => m.tipo === 'saida').length,
      total_entradas: movimentacoes.filter(m => m.tipo === 'entrada').reduce((acc, m) => acc + (m.quantidade || 0), 0),
      total_saidas: movimentacoes.filter(m => m.tipo === 'saida').reduce((acc, m) => acc + (m.quantidade || 0), 0)
    };
    
    res.json({ movimentacoes, stats });
  } catch (error) {
    console.error('❌ ERRO RELATÓRIO MOVIMENTAÇÕES:', error);
    res.status(500).json({ error: error.message });
  }
});

// Relatório de movimentações filtrado
app.get('/api/relatorio/movimentacoes', authMiddleware(), (req, res) => {
  const { categoria_id, data_inicio, data_fim, tipo } = req.query;
  
  let sql = `
    SELECT m.*, p.nome as produto_nome, p.categoria_id, c.nome as categoria_nome,
           u.nome as usuario_nome
    FROM movimentacoes m
    LEFT JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    LEFT JOIN users u ON m.usuario_id = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (categoria_id && categoria_id !== 'todos') {
    sql += ' AND p.categoria_id = ?';
    params.push(categoria_id);
  }
  
  if (data_inicio) {
    sql += ' AND DATE(m.data_movimentacao) >= DATE(?)';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    sql += ' AND DATE(m.data_movimentacao) <= DATE(?)';
    params.push(data_fim);
  }
  
  if (tipo && tipo !== 'todos') {
    sql += ' AND m.tipo = ?';
    params.push(tipo);
  }
  
  sql += ' ORDER BY m.data_movimentacao DESC';
  
  const movimentacoes = all(sql, params);
  
  // Estatísticas
  const stats = {
    total: movimentacoes.length,
    entradas: movimentacoes.filter(m => m.tipo === 'entrada').length,
    saidas: movimentacoes.filter(m => m.tipo === 'saida').length,
    total_entradas: movimentacoes.filter(m => m.tipo === 'entrada').reduce((acc, m) => acc + m.quantidade, 0),
    total_saidas: movimentacoes.filter(m => m.tipo === 'saida').reduce((acc, m) => acc + m.quantidade, 0)
  };
  
  res.json({ movimentacoes, stats });
});

// ============ CAPTURADOR GLOBAL DE ERROS (Para evitar HTML) ============
app.use((err, req, res, next) => {
  console.error('❌ ERRO CAPTURADO NO SERVIDOR:', err.message);
  console.error('📍 Rota:', req.method, req.url);
  res.status(500).json({ error: err.message });
});

// ============ INICIAR ============
initDB().then(() => {
  if (backupConfig.automatico) iniciarBackupAutomatico();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Sistema rodando em http://localhost:${PORT}`);
    console.log(`👤 Login: admin / admin123\n`);
  });
}).catch(err => {
  console.error('❌ Erro ao inicializar:', err);
  process.exit(1);
});