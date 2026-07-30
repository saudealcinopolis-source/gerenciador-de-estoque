const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sistema-estoque-secret-key-2024';
const DB_PATH = path.join(__dirname, 'database', 'estoque.db');
const BACKUP_CONFIG_PATH = path.join(__dirname, 'database', 'backup-config.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync('./database')) fs.mkdirSync('./database');
if (!fs.existsSync('./backups')) fs.mkdirSync('./backups');

let db;

// ==========================================
// HELPERS SQL.JS
// ==========================================
function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
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
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

function all(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (error) {
    console.error('❌ ERRO CRÍTICO NO BANCO:', error.message);
    console.error('📝 SQL:', sql);
    throw error;
  }
}

function lastId() {
  const r = get('SELECT last_insert_rowid() as id');
  return r ? r.id : 0;
}

// ==========================================
// MIDDLEWARES
// ==========================================
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

function requireRole(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.user || !perfisPermitidos.includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Acesso negado: perfil insuficiente' });
    }
    next();
  };
}

// Filtro de unidade flexível: passa o nome/alias da coluna conforme a query
function getFiltroUnidade(req, col = 'unidade_id') {
  if (req.user.perfil === 'admin') return { sql: '', params: [] };
  return { sql: ` AND ${col} = ?`, params: [req.user.unidade_id] };
}

// ==========================================
// INICIALIZAÇÃO DO BANCO
// ==========================================
async function initDB() {
  try {
    console.log('⏳ Carregando motor do banco de dados...');
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
      console.log('✅ Banco de dados existente carregado!');
    } else {
      db = new SQL.Database();
      console.log('🆕 Novo banco de dados criado.');
    }

    db.run(`CREATE TABLE IF NOT EXISTS unidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL, endereco TEXT,
      responsavel TEXT, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      nome TEXT NOT NULL, perfil TEXT NOT NULL DEFAULT 'usuario', unidade_id INTEGER,
      ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (unidade_id) REFERENCES unidades(id))`);

    db.run(`CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL, tipo TEXT NOT NULL)`);

    db.run(`CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, categoria_id INTEGER, unidade_id INTEGER,
      unidade TEXT DEFAULT 'UN', quantidade INTEGER DEFAULT 0, quantidade_minima INTEGER DEFAULT 0,
      unidades_por_caixa INTEGER DEFAULT NULL, data_validade DATE, lote TEXT, localizacao TEXT,
      marca TEXT, modelo TEXT, patrimonio TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoria_id) REFERENCES categorias(id), FOREIGN KEY (unidade_id) REFERENCES unidades(id))`);

    db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL, unidade_id INTEGER,
      tipo TEXT NOT NULL, quantidade INTEGER NOT NULL, motivo TEXT, usuario_id INTEGER,
      data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (produto_id) REFERENCES produtos(id), FOREIGN KEY (unidade_id) REFERENCES unidades(id),
      FOREIGN KEY (usuario_id) REFERENCES users(id))`);

    // Migração: adiciona unidades_por_caixa em bancos antigos
    try {
      db.run(`ALTER TABLE produtos ADD COLUMN unidades_por_caixa INTEGER DEFAULT NULL`);
      console.log('🔧 Coluna unidades_por_caixa adicionada');
    } catch (e) { /* coluna já existe — ok */ }
        // Migração: endereço detalhado em unidades
    ['tipo_logradouro TEXT DEFAULT \'Rua\'', 'logradouro TEXT', 'numero TEXT', 'bairro TEXT', 'descricao TEXT'].forEach(col => {
      try { db.run(`ALTER TABLE unidades ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
    });
    // Migração: descrição em produtos
    try { db.run(`ALTER TABLE produtos ADD COLUMN descricao TEXT`); } catch (e) { /* já existe */ }
    saveDB();

        // Dados padrão de Categorias
    if (get('SELECT COUNT(*) as c FROM categorias').c === 0) {
      const categoriasPadrao = [
        ['Material Permanente', 'permanente'],
        ['Material de Limpeza', 'limpeza'],
        ['Gênero Alimentício', 'alimento'],
        ['Material de Expediente', 'expediente'],
        ['Gás', 'gas'],
        ['Material de Informática', 'informatica'],
        ['Material Odontológico', 'odontologico'],
        ['Material de Enfermagem', 'enfermagem']
      ];
      categoriasPadrao.forEach(c => run('INSERT INTO categorias (nome, tipo) VALUES (?, ?)', c));
      console.log('📦 Categorias padrão criadas');
    }

    // Migração: se existir "Fardo" em bancos antigos, atualiza para "Material Odontológico"
    const fardoExists = get("SELECT id FROM categorias WHERE nome = 'Fardo'");
    if (fardoExists) {
      run("UPDATE categorias SET nome = 'Material Odontológico', tipo = 'odontologico' WHERE nome = 'Fardo'");
      console.log('🔄 Categoria "Fardo" atualizada para "Material Odontológico"');
    }
    
    // Migração: adiciona "Material de Enfermagem" caso o banco já existisse antes desta mudança
    if (!get("SELECT id FROM categorias WHERE nome = 'Material de Enfermagem'")) {
      run("INSERT INTO categorias (nome, tipo) VALUES ('Material de Enfermagem', 'enfermagem')");
      console.log('🆕 Categoria "Material de Enfermagem" adicionada');
    }

    // Migração: vincula registros órfãos à primeira unidade ativa
    const primeiraUnidade = get('SELECT id FROM unidades WHERE ativo = 1 LIMIT 1');
    if (primeiraUnidade) {
      const u = get('SELECT COUNT(*) as c FROM users WHERE unidade_id IS NULL').c;
      if (u > 0) { run('UPDATE users SET unidade_id = ? WHERE unidade_id IS NULL', [primeiraUnidade.id]); console.log(`🔧 ${u} usuário(s) vinculado(s)`); }
      const p = get('SELECT COUNT(*) as c FROM produtos WHERE unidade_id IS NULL').c;
      if (p > 0) { run('UPDATE produtos SET unidade_id = ? WHERE unidade_id IS NULL', [primeiraUnidade.id]); console.log(`🔧 ${p} produto(s) vinculado(s)`); }
      const m = get('SELECT COUNT(*) as c FROM movimentacoes WHERE unidade_id IS NULL').c;
      if (m > 0) { run('UPDATE movimentacoes SET unidade_id = ? WHERE unidade_id IS NULL', [primeiraUnidade.id]); console.log(`🔧 ${m} movimentação(ões) vinculada(s)`); }
    }

    console.log('✅ Banco de dados Multi-Unidade inicializado!');
  } catch (error) {
    console.error('❌ ERRO FATAL:', error);
    process.exit(1);
  }
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = get('SELECT * FROM users WHERE username = ? AND ativo = 1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    let unidadeId = user.unidade_id;
    if (!unidadeId) {
      const primeiraUnidade = get('SELECT id FROM unidades WHERE ativo = 1 LIMIT 1');
      if (primeiraUnidade) {
        run('UPDATE users SET unidade_id = ? WHERE id = ?', [primeiraUnidade.id, user.id]);
        unidadeId = primeiraUnidade.id;
      }
    }

    const unidade = get('SELECT nome FROM unidades WHERE id = ?', [unidadeId]);
    const token = jwt.sign(
      { id: user.id, username: user.username, perfil: user.perfil, nome: user.nome, unidade_id: unidadeId },
      JWT_SECRET, { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id, username: user.username, perfil: user.perfil, nome: user.nome,
        unidade_id: unidadeId, unidade_nome: unidade ? unidade.nome : 'Sem unidade'
      }
    });
  } catch (err) {
    console.error('❌ Erro no login:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// USUÁRIOS
// ==========================================
app.get('/api/users', authMiddleware(), (req, res) => {
  try {
    let sql = `SELECT u.id, u.username, u.nome, u.perfil, u.unidade_id, u.ativo, u.created_at,
                      un.nome as unidade_nome
               FROM users u LEFT JOIN unidades un ON u.unidade_id = un.id WHERE u.ativo = 1`;
    const params = [];
    if (req.user.perfil === 'coordenador') { sql += ' AND u.unidade_id = ?'; params.push(req.user.unidade_id); }
    else if (req.user.perfil !== 'admin') { sql += ' AND u.id = ?'; params.push(req.user.id); }
    sql += ' ORDER BY u.nome';
    res.json(all(sql, params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', authMiddleware(), (req, res) => {
  try {
    const { username, password, nome, perfil, unidade_id } = req.body;
    if (!username || !password || !nome) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    if (req.user.perfil === 'coordenador' && (perfil !== 'usuario' || unidade_id != req.user.unidade_id)) {
      return res.status(403).json({ error: 'Permissão negada' });
    }
    if (req.user.perfil === 'admin' && !unidade_id) return res.status(400).json({ error: 'Admin deve selecionar a unidade' });

    const hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (username, password, nome, perfil, unidade_id) VALUES (?, ?, ?, ?, ?)',
      [username, hash, nome, perfil || 'usuario', unidade_id]);
    res.json({ success: true, id: lastId() });
  } catch (err) {
    res.status(err.message.includes('UNIQUE') ? 400 : 500)
      .json({ error: err.message.includes('UNIQUE') ? 'Username já está em uso' : 'Erro ao criar usuário' });
  }
});

app.put('/api/users/:id', authMiddleware(), (req, res) => {
  try {
    const { nome, perfil, ativo, password, unidade_id } = req.body;
    const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      run('UPDATE users SET nome=?, perfil=?, ativo=?, unidade_id=?, password=? WHERE id=?',
        [nome || user.nome, perfil || user.perfil, ativo ?? user.ativo, unidade_id ?? user.unidade_id, hash, req.params.id]);
    } else {
      run('UPDATE users SET nome=?, perfil=?, ativo=?, unidade_id=? WHERE id=?',
        [nome || user.nome, perfil || user.perfil, ativo ?? user.ativo, unidade_id ?? user.unidade_id, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', authMiddleware(), (req, res) => {
  try { run('UPDATE users SET ativo = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// CATEGORIAS E UNIDADES
// ==========================================
app.get('/api/categorias', authMiddleware(), (req, res) => res.json(all('SELECT * FROM categorias ORDER BY nome')));

app.get('/api/unidades', authMiddleware(), (req, res) => {
  try {
    let rows = req.user.perfil === 'admin'
      ? all('SELECT * FROM unidades WHERE ativo = 1 ORDER BY nome')
      : all('SELECT * FROM unidades WHERE id = ? AND ativo = 1', [req.user.unidade_id]);
    // Monta um endereço legível para exibição
    rows = rows.map(u => ({
      ...u,
      endereco_completo: u.endereco || [u.tipo_logradouro, u.logradouro].filter(Boolean).join(' ')
        + (u.numero ? `, ${u.numero}` : '') + (u.bairro ? ` – ${u.bairro}` : '')
    }));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/unidades', authMiddleware(), requireRole('admin'), (req, res) => {
  try {
    const { nome, tipo_logradouro, logradouro, numero, bairro, responsavel, descricao } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome da unidade é obrigatório' });
    const endereco = [tipo_logradouro, logradouro].filter(Boolean).join(' ')
      + (numero ? `, ${numero}` : '') + (bairro ? ` – ${bairro}` : '');
    run(`INSERT INTO unidades (nome, tipo_logradouro, logradouro, numero, bairro, responsavel, descricao, endereco)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, tipo_logradouro || 'Rua', logradouro, numero, bairro, responsavel, descricao, endereco]);
    res.json({ success: true, id: lastId() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/unidades/:id', authMiddleware(), requireRole('admin'), (req, res) => {
  try {
    const { nome, tipo_logradouro, logradouro, numero, bairro, responsavel, descricao, ativo } = req.body;
    const endereco = [tipo_logradouro, logradouro].filter(Boolean).join(' ')
      + (numero ? `, ${numero}` : '') + (bairro ? ` – ${bairro}` : '');
    run(`UPDATE unidades SET nome=?, tipo_logradouro=?, logradouro=?, numero=?, bairro=?, responsavel=?, descricao=?, endereco=?, ativo=? WHERE id=?`,
      [nome, tipo_logradouro, logradouro, numero, bairro, responsavel, descricao, endereco, ativo !== undefined ? ativo : 1, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/unidades/:id', authMiddleware(), requireRole('admin'), (req, res) => {
  try { run('UPDATE unidades SET ativo = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// PRODUTOS
// ==========================================
app.get('/api/produtos', authMiddleware(), (req, res) => {
  try {
    const f = getFiltroUnidade(req, 'p.unidade_id');
    res.json(all(`SELECT p.*, c.nome as categoria_nome, u.nome as unidade_nome
                  FROM produtos p
                  LEFT JOIN categorias c ON p.categoria_id = c.id
                  LEFT JOIN unidades u ON p.unidade_id = u.id
                  WHERE 1=1 ${f.sql} ORDER BY p.nome`, f.params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/produtos', authMiddleware(), (req, res) => {
  try {
    const { nome, categoria_id, unidade, quantidade, quantidade_minima, data_validade, lote,
            localizacao, marca, modelo, patrimonio, unidade_id, unidades_por_caixa, descricao } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome do produto é obrigatório' });

    let unidadeFinal = unidade_id;
    if (req.user.perfil !== 'admin') unidadeFinal = req.user.unidade_id;
    if (!unidadeFinal) return res.status(400).json({ error: 'Selecione a unidade de saúde do produto' });

    const upc = (unidade && unidade.startsWith('CX')) ? (parseInt(unidades_por_caixa) || null) : null;

    run(`INSERT INTO produtos (nome, categoria_id, unidade_id, unidade, quantidade, quantidade_minima,
         unidades_por_caixa, data_validade, lote, localizacao, marca, modelo, patrimonio, descricao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, categoria_id, unidadeFinal, unidade || 'UN', quantidade || 0, quantidade_minima || 0,
       upc, data_validade || null, lote || null, localizacao || null, marca || null, modelo || null, patrimonio || null, descricao || null]);

    res.json({ success: true, id: lastId() });
  } catch (err) {
    console.error('❌ Erro ao salvar produto:', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar produto: ' + err.message });
  }
});

app.put('/api/produtos/:id', authMiddleware(), (req, res) => {
  try {
    const { nome, categoria_id, unidade, quantidade, quantidade_minima, data_validade, lote,
            localizacao, marca, modelo, patrimonio, unidade_id, unidades_por_caixa, descricao } = req.body;
    let unidadeFinal = unidade_id;
    if (req.user.perfil !== 'admin') unidadeFinal = req.user.unidade_id;
    const upc = (unidade && unidade.startsWith('CX')) ? (parseInt(unidades_por_caixa) || null) : null;

    if (req.user.perfil === 'admin') {
      run(`UPDATE produtos SET nome=?, categoria_id=?, unidade_id=?, unidade=?, quantidade=?, quantidade_minima=?,
           unidades_por_caixa=?, data_validade=?, lote=?, localizacao=?, marca=?, modelo=?, patrimonio=?, descricao=? WHERE id=?`,
        [nome, categoria_id, unidadeFinal, unidade, quantidade, quantidade_minima, upc, data_validade,
         lote, localizacao, marca, modelo, patrimonio, descricao, req.params.id]);
    } else {
      run(`UPDATE produtos SET nome=?, categoria_id=?, unidade=?, quantidade=?, quantidade_minima=?,
           unidades_por_caixa=?, data_validade=?, lote=?, localizacao=?, marca=?, modelo=?, patrimonio=?, descricao=?
           WHERE id=? AND unidade_id=?`,
        [nome, categoria_id, unidade, quantidade, quantidade_minima, upc, data_validade, lote,
         localizacao, marca, modelo, patrimonio, descricao, req.params.id, req.user.unidade_id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar produto:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar produto: ' + err.message });
  }
});

app.delete('/api/produtos/:id', authMiddleware(), (req, res) => {
  try {
    if (req.user.perfil === 'admin') {
      run('DELETE FROM produtos WHERE id=?', [req.params.id]);
    } else {
      run('DELETE FROM produtos WHERE id=? AND unidade_id=?', [req.params.id, req.user.unidade_id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vencimentos
app.get('/api/produtos/vencidos', authMiddleware(), (req, res) => {
  try {
    const f = getFiltroUnidade(req, 'p.unidade_id');
    res.json(all(`SELECT p.*, c.nome as categoria_nome,
                  CAST(julianday('now') - julianday(p.data_validade) AS INTEGER) as dias_vencido
                  FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id
                  WHERE p.data_validade IS NOT NULL AND date(p.data_validade) < date('now') ${f.sql}
                  ORDER BY p.data_validade ASC`, f.params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/produtos/vencendo', authMiddleware(), (req, res) => {
  try {
    const dias = req.query.dias || 10;
    const f = getFiltroUnidade(req, 'p.unidade_id');
    res.json(all(`SELECT p.*, c.nome as categoria_nome,
                  CAST(julianday(p.data_validade) - julianday('now') AS INTEGER) as dias_restantes
                  FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id
                  WHERE p.data_validade IS NOT NULL AND date(p.data_validade) >= date('now')
                    AND date(p.data_validade) <= date('now', '+' || ? || ' days') ${f.sql}
                  ORDER BY p.data_validade ASC`, [dias, ...f.params]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/produtos/faixas-vencimento', authMiddleware(), (req, res) => {
  try {
    const f = getFiltroUnidade(req, 'p.unidade_id');
    const produtos = all(`SELECT p.*, c.nome as categoria_nome, c.tipo as categoria_tipo,
                          CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes
                          FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id
                          WHERE p.data_validade IS NOT NULL AND p.quantidade > 0 ${f.sql}`, f.params);
    const faixas = { maior_120: [], ate_90: [], ate_60: [], ate_30: [], vencidos: [], sem_validade: [] };
    produtos.forEach(p => {
      if (p.dias_restantes < 0) faixas.vencidos.push(p);
      else if (p.dias_restantes <= 30) faixas.ate_30.push(p);
      else if (p.dias_restantes <= 60) faixas.ate_60.push(p);
      else if (p.dias_restantes <= 90) faixas.ate_90.push(p);
      else if (p.dias_restantes > 120) faixas.maior_120.push(p);
    });
    res.json(faixas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// MOVIMENTAÇÕES
// ==========================================
app.post('/api/movimentacoes', authMiddleware(), (req, res) => {
  try {
    const { produto_id, tipo, quantidade, motivo } = req.body;
    const qtd = parseInt(quantidade);
    if (!['entrada', 'saida'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (!qtd || qtd <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    if (req.user.perfil === 'usuario' && tipo !== 'saida') return res.status(403).json({ error: 'Você só pode dar baixa (saída)' });

    const produto = req.user.perfil === 'admin'
      ? get('SELECT * FROM produtos WHERE id = ?', [produto_id])
      : get('SELECT * FROM produtos WHERE id = ? AND unidade_id = ?', [produto_id, req.user.unidade_id]);

    if (!produto) return res.status(404).json({ error: 'Produto não encontrado na sua unidade' });
    if (tipo === 'saida' && produto.quantidade < qtd) {
      return res.status(400).json({ error: `Estoque insuficiente (disponível: ${produto.quantidade})` });
    }

    const novaQuantidade = tipo === 'entrada' ? produto.quantidade + qtd : produto.quantidade - qtd;
    run('UPDATE produtos SET quantidade = ? WHERE id = ?', [novaQuantidade, produto_id]);
    run('INSERT INTO movimentacoes (produto_id, unidade_id, tipo, quantidade, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
      [produto_id, produto.unidade_id, tipo, qtd, motivo || null, req.user.id]);
    res.json({ success: true, novaQuantidade });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/movimentacoes', authMiddleware(), (req, res) => {
  try {
    const f = getFiltroUnidade(req, 'm.unidade_id');
    res.json(all(`SELECT m.*, COALESCE(p.nome, 'Produto Excluído') as produto_nome, p.categoria_id,
                  c.nome as categoria_nome, u.nome as usuario_nome
                  FROM movimentacoes m
                  LEFT JOIN produtos p ON m.produto_id = p.id
                  LEFT JOIN categorias c ON p.categoria_id = c.id
                  LEFT JOIN users u ON m.usuario_id = u.id
                  WHERE 1=1 ${f.sql} ORDER BY m.data_movimentacao DESC LIMIT 500`, f.params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// NOTIFICAÇÕES E DASHBOARD
// ==========================================
app.get('/api/notificacoes', authMiddleware(), (req, res) => {
  try {
    const f = getFiltroUnidade(req, 'unidade_id');
    const base = `FROM produtos WHERE data_validade IS NOT NULL ${f.sql}`;

    const vencendo = all(`SELECT id, nome, data_validade, categoria_id,
                          CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes
                          ${base} AND data_validade BETWEEN date('now') AND date('now', '+10 days')
                          ORDER BY data_validade`, f.params);
    const vencidos = all(`SELECT id, nome, data_validade, categoria_id,
                          CAST(julianday('now') - julianday(data_validade) AS INTEGER) as dias_vencido
                          ${base} AND data_validade < date('now') ORDER BY data_validade`, f.params);
    const estoqueBaixo = all(`SELECT id, nome, quantidade, quantidade_minima FROM produtos
                              WHERE quantidade <= quantidade_minima AND quantidade_minima > 0 ${f.sql}`, f.params);

    res.json({ vencendo, vencidos, estoqueBaixo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard', authMiddleware(), (req, res) => {
  try {
    const f = getFiltroUnidade(req, 'unidade_id');
    const w = f.sql ? `WHERE 1=1 ${f.sql}` : '';
    res.json({
      totalProdutos: get(`SELECT COUNT(*) as c FROM produtos ${w}`, f.params).c,
      totalItens: get(`SELECT COALESCE(SUM(quantidade),0) as c FROM produtos ${w}`, f.params).c,
      vencendo10: get(`SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL
                       AND data_validade <= date('now', '+10 days') AND data_validade >= date('now') ${f.sql}`, f.params).c,
      vencidos: get(`SELECT COUNT(*) as c FROM produtos WHERE data_validade IS NOT NULL
                     AND data_validade < date('now') ${f.sql}`, f.params).c,
      estoqueBaixo: get(`SELECT COUNT(*) as c FROM produtos WHERE quantidade <= quantidade_minima
                         AND quantidade_minima > 0 ${f.sql}`, f.params).c
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// RELATÓRIOS
// ==========================================
app.get('/api/relatorio/produtos', authMiddleware(), (req, res) => {
  try {
    const { categoria_id } = req.query;
    const f = getFiltroUnidade(req, 'p.unidade_id');
    let sql = `SELECT p.*, c.nome as categoria_nome,
               CAST(julianday(data_validade) - julianday('now') AS INTEGER) as dias_restantes,
               CASE WHEN p.data_validade IS NULL THEN 'Sem validade'
                    WHEN julianday(p.data_validade) < julianday('now') THEN 'Vencido'
                    WHEN julianday(p.data_validade) - julianday('now') <= 30 THEN 'Crítico (≤30 dias)'
                    WHEN julianday(p.data_validade) - julianday('now') <= 60 THEN 'Urgente (≤60 dias)'
                    WHEN julianday(p.data_validade) - julianday('now') <= 90 THEN 'Atenção (≤90 dias)'
                    ELSE 'OK (>90 dias)' END as status
               FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1 ${f.sql}`;
    const params = [...f.params];
    if (categoria_id && categoria_id !== 'todos') { sql += ' AND p.categoria_id = ?'; params.push(categoria_id); }
    sql += ' ORDER BY c.nome, p.nome';

    const produtos = all(sql, params);
    res.json({
      produtos,
      stats: {
        total: produtos.length,
        com_estoque: produtos.filter(p => p.quantidade > 0).length,
        vencidos: produtos.filter(p => p.dias_restantes !== null && p.dias_restantes < 0).length,
        criticos: produtos.filter(p => p.dias_restantes !== null && p.dias_restantes >= 0 && p.dias_restantes <= 30).length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/relatorio/movimentacoes', authMiddleware(), (req, res) => {
  try {
    const { categoria_id, data_inicio, data_fim, tipo } = req.query;
    const f = getFiltroUnidade(req, 'm.unidade_id');
    let sql = `SELECT m.id, m.tipo, m.quantidade, m.motivo, m.data_movimentacao,
               p.nome as produto_nome, c.nome as categoria_nome, u.nome as usuario_nome
               FROM movimentacoes m
               LEFT JOIN produtos p ON m.produto_id = p.id
               LEFT JOIN categorias c ON p.categoria_id = c.id
               LEFT JOIN users u ON m.usuario_id = u.id WHERE 1=1 ${f.sql}`;
    const params = [...f.params];
    if (categoria_id && categoria_id !== 'todos') { sql += ' AND p.categoria_id = ?'; params.push(categoria_id); }
    if (data_inicio) { sql += ' AND DATE(m.data_movimentacao) >= DATE(?)'; params.push(data_inicio); }
    if (data_fim) { sql += ' AND DATE(m.data_movimentacao) <= DATE(?)'; params.push(data_fim); }
    if (tipo && tipo !== 'todos') { sql += ' AND m.tipo = ?'; params.push(tipo); }
    sql += ' ORDER BY m.data_movimentacao DESC';

    const movimentacoes = all(sql, params);
    res.json({
      movimentacoes,
      stats: {
        total: movimentacoes.length,
        entradas: movimentacoes.filter(m => m.tipo === 'entrada').length,
        saidas: movimentacoes.filter(m => m.tipo === 'saida').length,
        total_entradas: movimentacoes.filter(m => m.tipo === 'entrada').reduce((a, m) => a + (m.quantidade || 0), 0),
        total_saidas: movimentacoes.filter(m => m.tipo === 'saida').reduce((a, m) => a + (m.quantidade || 0), 0)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// BACKUP INTELIGENTE
// ==========================================
let backupConfig = { automatico: false, frequencia: 'dia', horario: '02:00', reter: 10, inteligente: true, ultimoBackup: null, ultimoHash: null };
if (fs.existsSync(BACKUP_CONFIG_PATH)) {
  try { backupConfig = JSON.parse(fs.readFileSync(BACKUP_CONFIG_PATH, 'utf8')); } catch (e) {}
}
function saveBackupConfig() { fs.writeFileSync(BACKUP_CONFIG_PATH, JSON.stringify(backupConfig, null, 2)); }
function getDBHash() { return crypto.createHash('md5').update(Buffer.from(db.export())).digest('hex'); }

function criarBackupInteligente(motivo = 'manual', forcar = false) {
  const currentHash = getDBHash();
  if (motivo === 'automático' && backupConfig.inteligente && !forcar && currentHash === backupConfig.ultimoHash) {
    return { sucesso: false, motivo: 'sem_alteracoes' };
  }
  const date = new Date();
  const filename = `backup_${date.toISOString().split('T')[0]}_${date.toTimeString().split(' ')[0].replace(/:/g, '-')}_${motivo}.db`;
  const backupPath = path.join(BACKUP_DIR, filename);
  try {
    fs.writeFileSync(backupPath, Buffer.from(db.export()));
    backupConfig.ultimoBackup = date.toISOString();
    backupConfig.ultimoHash = currentHash;
    saveBackupConfig();

    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, date: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    while (files.length > backupConfig.reter) fs.unlinkSync(path.join(BACKUP_DIR, files.pop().name));

    return { sucesso: true, filename, nome: filename, tamanho: fs.statSync(backupPath).size };
  } catch (e) { return { sucesso: false, erro: e.message }; }
}

let backupJob = null;
function setupAutoBackup() {
  if (backupJob) { backupJob.stop(); backupJob = null; }
  const freq = (backupConfig.frequencia || 'dia').toLowerCase();
  const horario = backupConfig.horario || '02:00';
  if (!backupConfig.automatico) { console.log('⏰ Backup automático desativado.'); return; }

  const timeParts = horario.split(':');
  if (timeParts.length !== 2) { console.error('❌ Formato de horário inválido:', horario); return; }
  const [hours, minutes] = timeParts;

  let cronExpression = '';
  switch (freq) {
    case 'hora': cronExpression = `${minutes} * * * *`; break;
    case 'dia': cronExpression = `${minutes} ${hours} * * *`; break;
    case 'semana': cronExpression = `${minutes} ${hours} * * 0`; break;
    case 'mes': cronExpression = `${minutes} ${hours} 1 * *`; break;
    default: cronExpression = `${minutes} ${hours} * * *`; break;
  }

  try {
    backupJob = cron.schedule(cronExpression, () => {
      console.log(`⏰ Executando backup agendado (${freq})...`);
      const res = criarBackupInteligente('automático');
      if (res.sucesso) {
        setTimeout(() => {
          try { fs.writeFileSync(path.join(__dirname, 'public', 'refresh.txt'), res.filename + '_' + Date.now()); } catch (e) {}
        }, 2000);
      }
    });
    console.log(`⏰ Backup automático agendado: ${freq} às ${horario} (Cron: ${cronExpression})`);
  } catch (e) {
    console.error('❌ Erro ao configurar backup automático:', e.message);
  }
}

app.get('/api/backup-config', authMiddleware(), (req, res) => res.json(backupConfig));
app.put('/api/backup-config', authMiddleware(), requireRole('admin'), (req, res) => {
  backupConfig = { ...backupConfig, ...req.body };
  saveBackupConfig();
  setupAutoBackup();
  res.json({ success: true, config: backupConfig });
});
app.post('/api/backup', authMiddleware(), requireRole('admin'), (req, res) => res.json(criarBackupInteligente('manual', req.body.forcar)));
app.post('/api/backup/forcar', authMiddleware(), requireRole('admin'), (req, res) => res.json(criarBackupInteligente('forcado', true)));

app.get('/api/backups', authMiddleware(), requireRole('admin'), (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).map(f => {
    const stats = fs.statSync(path.join(BACKUP_DIR, f));
    return { name: f, size: stats.size, date: stats.mtime, tipo: f.includes('automático') ? 'automático' : f.includes('forcado') ? 'forçado' : 'manual' };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(files);
});

app.get('/api/backups/:filename/download', authMiddleware(), requireRole('admin'), (req, res) => {
  const filePath = path.join(BACKUP_DIR, req.params.filename);
  if (fs.existsSync(filePath)) res.download(filePath);
  else res.status(404).json({ error: 'Não encontrado' });
});

app.delete('/api/backups/:filename', authMiddleware(), requireRole('admin'), (req, res) => {
  const filePath = path.join(BACKUP_DIR, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.post('/api/restore', authMiddleware(), requireRole('admin'), async (req, res) => {
  try {
    const backupPath = path.join(BACKUP_DIR, req.body.filename);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup não encontrado' });
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `safety_${Date.now()}.db`));
    db = new (await initSqlJs()).Database(fs.readFileSync(backupPath));
    saveDB();
    backupConfig.ultimoHash = getDBHash(); // evita backup duplicado pós-restore
    saveBackupConfig();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/backup-stats', authMiddleware(), requireRole('admin'), (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
  res.json({
    totalBackups: files.length,
    tamanhoTotal: files.reduce((acc, f) => acc + fs.statSync(path.join(BACKUP_DIR, f)).size, 0),
    ultimoBackup: backupConfig.ultimoBackup,
    automaticoAtivo: backupConfig.automatico
  });
});

// ==========================================
// TRATAMENTO GLOBAL DE ERROS + INICIAR
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ ERRO CAPTURADO:', err.message);
  res.status(500).json({ error: err.message });
});

initDB().then(() => {
  setupAutoBackup();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📦 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error('❌ Erro ao inicializar:', err);
  process.exit(1);
});