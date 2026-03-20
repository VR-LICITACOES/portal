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

// ========== ARQUIVOS ESTÁTICOS ==========
app.use(express.static(path.join(__dirname, 'apps', 'portal')));
app.use('/precos', express.static(path.join(__dirname, 'apps', 'precos')));
app.use('/fornecedores', express.static(path.join(__dirname, 'apps', 'fornecedores')));
app.use('/licitacoes', express.static(path.join(__dirname, 'apps', 'licitacoes')));

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

// ========== ROTAS DE API PARA PREÇOS ==========
// (mantidas do código original, não repetido aqui por brevidade)
// ... (cole aqui as rotas de /api/marcas, /api/precos etc.)

// ========== ROTAS DE API PARA FORNECEDORES ==========
// (mantidas do código original)
// ... (cole aqui as rotas de fornecedores)

// ========== ROTAS DE API PARA LICITAÇÕES ==========
app.get('/api/licitacoes', authenticate, async (req, res) => {
  const { mes, ano } = req.query;
  let query = supabase.from('licitacoes').select('*', { count: 'exact' });
  if (mes && ano) {
    const startDate = new Date(ano, mes-1, 1).toISOString().split('T')[0];
    const endDate = new Date(ano, mes, 0).toISOString().split('T')[0];
    query = query.gte('data', startDate).lte('data', endDate);
  }
  query = query.order('data', { ascending: false });
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/licitacoes', authenticate, async (req, res) => {
  const { numero_proposta, data, hora, uf, status = 'ABERTA' } = req.body;
  if (!numero_proposta || !data) return res.status(400).json({ error: 'Número e data obrigatórios' });
  const { data: inserted, error } = await supabase
    .from('licitacoes')
    .insert({ numero_proposta, data, hora, uf, status })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(inserted[0]);
});

app.put('/api/licitacoes/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const { data, error } = await supabase
    .from('licitacoes')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/licitacoes/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('licitacoes')
    .delete()
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ========== ROTAS DE API PARA ITENS DA LICITAÇÃO (tabela "itens") ==========
app.get('/api/licitacoes/:id/itens', authenticate, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('itens')
    .select('*')
    .eq('licitacao_id', id)
    .order('numero');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/licitacoes/:id/itens', authenticate, async (req, res) => {
  const { id } = req.params;
  const item = req.body;
  item.licitacao_id = id;
  const { data, error } = await supabase
    .from('itens')
    .insert(item)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put('/api/licitacoes/:id/itens/:itemId', authenticate, async (req, res) => {
  const { itemId } = req.params;
  const updates = req.body;
  const { data, error } = await supabase
    .from('itens')
    .update(updates)
    .eq('id', itemId)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/licitacoes/:id/itens/:itemId', authenticate, async (req, res) => {
  const { itemId } = req.params;
  const { error } = await supabase
    .from('itens')
    .delete()
    .eq('id', itemId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

app.post('/api/licitacoes/:id/itens/delete-multiple', authenticate, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'Nenhum ID fornecido' });
  const { error } = await supabase
    .from('itens')
    .delete()
    .in('id', ids);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ========== ROTAS DE FALLBACK ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html')));
app.get('/precos', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'precos', 'index.html')));
app.get('/fornecedores', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'fornecedores', 'index.html')));
app.get('/licitacoes', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'licitacoes', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
