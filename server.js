require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'apps', 'portal')));
app.use('/precos', express.static(path.join(__dirname, 'apps', 'precos')));
app.use('/fornecedores', express.static(path.join(__dirname, 'apps', 'fornecedores')));

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ========== DIAGNÓSTICO DA TABELA FORNECEDORES ==========
async function ensureFornecedoresTable() {
  try {
    const { error } = await supabase
      .from('fornecedores')
      .select('id', { count: 'exact', head: true });
    if (error && error.message.includes('relation "public.fornecedores" does not exist')) {
      console.error('\n❌ Tabela "fornecedores" não existe! Execute este SQL no Supabase:\n');
      console.error(`
CREATE TABLE public.fornecedores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    telefone TEXT,
    celular TEXT,
    email TEXT,
    metodo_envio TEXT DEFAULT 'whatsapp' CHECK (metodo_envio IN ('whatsapp', 'email')),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.fornecedores DISABLE ROW LEVEL SECURITY;
      `);
    } else if (error) {
      console.error('❌ Erro ao verificar tabela fornecedores:', error);
    } else {
      console.log('✅ Tabela fornecedores OK');
    }
  } catch (e) {
    console.error('❌ Exceção ao verificar tabela:', e);
  }
}
ensureFornecedoresTable();

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
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, name, is_admin, sector, apps, is_active')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !user || !user.is_active || password !== user.password) {
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

    if (sessionError) throw sessionError;

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
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno' });
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
    res.json({ valid: !error && !!session, user: session?.users });
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

// ========== ROTAS DE API PARA PREÇOS (resumido) ==========
app.get('/api/marcas', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.from('precos').select('marca').order('marca');
    if (error) throw error;
    const marcas = [...new Set(data.map(i => i.marca).filter(Boolean))].sort();
    res.json(marcas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar marcas' });
  }
});

app.get('/api/precos', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const { marca, search } = req.query;
  try {
    let query = supabase.from('precos').select('*', { count: 'exact' });
    if (marca && marca !== 'TODAS') query = query.eq('marca', marca);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`codigo.ilike.${term},descricao.ilike.${term},marca.ilike.${term}`);
    }
    const { data, error, count } = await query.order('marca').order('codigo').range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ data, total: count, page, totalPages: Math.ceil(count / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar preços' });
  }
});

// ========== ROTAS DE API PARA FORNECEDORES ==========
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

    if (error) {
      // Se o erro for de tabela inexistente, orienta o usuário
      if (error.message.includes('relation "public.fornecedores" does not exist')) {
        return res.status(500).json({ 
          error: 'Tabela de fornecedores não existe. Execute o SQL fornecido nos logs do servidor.' 
        });
      }
      throw error;
    }

    res.json({
      data: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    console.error('Erro ao buscar fornecedores:', err);
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

app.post('/api/fornecedores', authenticate, async (req, res) => {
  const { nome, telefone, celular, email, metodo_envio } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

  try {
    const { data, error } = await supabase
      .from('fornecedores')
      .insert([{
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        celular: celular?.trim() || null,
        email: email?.trim() || null,
        metodo_envio: metodo_envio || 'whatsapp',
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
    if (!data?.length) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(data[0]);
  } catch (err) {
    console.error('Erro ao atualizar fornecedor:', err);
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html')));
app.get('/precos', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'precos', 'index.html')));
app.get('/fornecedores', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'fornecedores', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
