require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// ========== ARQUIVOS ESTÁTICOS ==========
// Portal
app.use(express.static(path.join(__dirname, 'apps', 'portal')));
// Preços
app.use('/precos', express.static(path.join(__dirname, 'apps', 'precos')));
// Fornecedores
app.use('/fornecedores', express.static(path.join(__dirname, 'apps', 'fornecedores')));

// ========== SUPABASE CLIENT ==========
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ========== RATE LIMITER ==========
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas, tente novamente mais tarde.' },
  validate: false
});

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
async function authenticate(req, res, next) {
  const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Token de sessão não fornecido' });
  }

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, users(*)')
      .eq('session_token', sessionToken)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !session) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    }

    req.user = session.users;
    next();
  } catch (err) {
    console.error('Erro na autenticação:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// ========== ROTAS DE API DO PORTAL ==========
app.get('/api/ip', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip });
});

app.post('/api/login', limiter, async (req, res) => {
  const { username, password, deviceToken } = req.body;
  try {
    console.log(`🔐 Tentativa de login: ${username}`);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, name, is_admin, sector, apps, is_active')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    if (password !== user.password) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        session_token: sessionToken,
        user_id: user.id,
        device_token: deviceToken,
        ip_address: ipAddress,
        expires_at: expiresAt.toISOString()
      });

    if (sessionError) {
      console.error('❌ Erro ao criar sessão:', sessionError);
      return res.status(500).json({ error: 'Erro interno ao criar sessão' });
    }

    res.json({
      success: true,
      session: {
        username: user.username,
        name: user.name,
        is_admin: user.is_admin,
        sector: user.sector,
        apps: user.apps,
        sessionToken,
        deviceToken,
        expiresAt
      }
    });
  } catch (err) {
    console.error('❌ Erro inesperado:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/api/verify-session', async (req, res) => {
  const { sessionToken } = req.body;
  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, users(*)')
      .eq('session_token', sessionToken)
      .gte('expires_at', new Date().toISOString())
      .single();
    if (error || !session) return res.json({ valid: false });
    res.json({ valid: true, user: session.users });
  } catch {
    res.json({ valid: false });
  }
});

app.post('/api/logout', async (req, res) => {
  const { sessionToken, deviceToken } = req.body;
  try {
    await supabase
      .from('sessions')
      .delete()
      .eq('session_token', sessionToken)
      .eq('device_token', deviceToken);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
});

// ========== ROTAS DE API PARA PREÇOS ==========
app.get('/api/marcas', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('marca')
      .order('marca');

    if (error) throw error;
    const marcas = [...new Set(data.map(item => item.marca).filter(Boolean))].sort();
    res.json(marcas);
  } catch (err) {
    console.error('Erro ao buscar marcas:', err);
    res.status(500).json({ error: 'Erro ao buscar marcas' });
  }
});

app.get('/api/precos', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const { marca, search } = req.query;

  try {
    let query = supabase
      .from('precos')
      .select('*', { count: 'exact' });

    if (marca && marca !== 'TODAS') {
      query = query.eq('marca', marca);
    }

    if (search) {
      const term = `%${search}%`;
      query = query.or(`codigo.ilike.${term},descricao.ilike.${term},marca.ilike.${term}`);
    }

    const { data, error, count } = await query
      .order('marca')
      .order('codigo')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error('Erro ao buscar preços:', err);
    res.status(500).json({ error: 'Erro ao buscar preços' });
  }
});

app.post('/api/precos', authenticate, async (req, res) => {
  const { marca, codigo, preco, descricao } = req.body;
  if (!marca || !codigo || !preco || !descricao) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('precos')
      .insert([{
        marca: marca.trim(),
        codigo: codigo.trim(),
        preco: parseFloat(preco),
        descricao: descricao.trim().toUpperCase(),
        timestamp: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro ao criar preço:', err);
    res.status(500).json({ error: 'Erro ao criar preço' });
  }
});

app.put('/api/precos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { marca, codigo, preco, descricao } = req.body;

  try {
    const { data, error } = await supabase
      .from('precos')
      .update({
        marca: marca.trim(),
        codigo: codigo.trim(),
        preco: parseFloat(preco),
        descricao: descricao.trim().toUpperCase(),
        timestamp: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Preço não encontrado' });
    }
    res.json(data[0]);
  } catch (err) {
    console.error('Erro ao atualizar preço:', err);
    res.status(500).json({ error: 'Erro ao atualizar preço' });
  }
});

app.delete('/api/precos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('precos')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar preço:', err);
    res.status(500).json({ error: 'Erro ao deletar preço' });
  }
});

// ========== ROTAS DE API PARA FORNECEDORES ==========

// GET /api/fornecedores – listagem paginada com busca
app.get('/api/fornecedores', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const { search } = req.query;

  try {
    let query = supabase
      .from('fornecedores')
      .select('*', { count: 'exact' });

    if (search) {
      const term = `%${search}%`;
      query = query.or(`nome.ilike.${term},telefone.ilike.${term},celular.ilike.${term},email.ilike.${term}`);
    }

    const { data, error, count } = await query
      .order('nome')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error('Erro ao buscar fornecedores:', err);
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

// POST /api/fornecedores – criar novo fornecedor
app.post('/api/fornecedores', authenticate, async (req, res) => {
  const { nome, telefone, celular, email, metodo_envio } = req.body;
  if (!nome) {
    return res.status(400).json({ error: 'Nome do fornecedor é obrigatório' });
  }

  try {
    const { data, error } = await supabase
      .from('fornecedores')
      .insert([{
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        celular: celular?.trim() || null,
        email: email?.trim() || null,
        metodo_envio: metodo_envio || 'whatsapp', // padrão
        timestamp: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro ao criar fornecedor:', err);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

// PUT /api/fornecedores/:id – atualizar fornecedor
app.put('/api/fornecedores/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, celular, email, metodo_envio } = req.body;

  try {
    const { data, error } = await supabase
      .from('fornecedores')
      .update({
        nome: nome?.trim(),
        telefone: telefone?.trim() || null,
        celular: celular?.trim() || null,
        email: email?.trim() || null,
        metodo_envio: metodo_envio,
        timestamp: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
    res.json(data[0]);
  } catch (err) {
    console.error('Erro ao atualizar fornecedor:', err);
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

// DELETE /api/fornecedores/:id – excluir fornecedor
app.delete('/api/fornecedores/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('fornecedores')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar fornecedor:', err);
    res.status(500).json({ error: 'Erro ao deletar fornecedor' });
  }
});

// ========== ROTAS DE FALLBACK ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html'));
});

app.get('/precos', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'precos', 'index.html'));
});

app.get('/fornecedores', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'fornecedores', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html'));
});

// ========== INICIA O SERVIDOR ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
