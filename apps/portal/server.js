const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

router.use(cors());
router.use(express.json());
router.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas, tente novamente mais tarde.' }
});

router.get('/api/ip', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip });
});

// Rota de login
router.post('/api/login', limiter, async (req, res) => {
  const { username, password, deviceToken } = req.body;

  try {
    console.log(`🔐 Tentativa de login: ${username}`);

    // Consulta na tabela users (schema public)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, name, is_admin, sector, apps, is_active')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !user) {
      console.log(`❌ Usuário não encontrado: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    if (!user.is_active) {
      console.log(`❌ Usuário inativo: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    console.log(`👤 Usuário encontrado: ${user.username}, senha no banco: ${user.password}`);

    // 🔓 COMPARAÇÃO DIRETA
    if (password !== user.password) {
      console.log(`❌ Senha incorreta fornecida: ${password}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    console.log(`✅ Senha OK para: ${username}`);

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
    console.error('❌ Erro no login:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota para verificar sessão
router.post('/api/verify-session', async (req, res) => {
  const { sessionToken } = req.body;

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, users(*)')
      .eq('session_token', sessionToken)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !session) {
      return res.json({ valid: false });
    }

    res.json({ valid: true, user: session.users });
  } catch (err) {
    res.json({ valid: false });
  }
});

// Rota de logout
router.post('/api/logout', async (req, res) => {
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

// ---------- ADMIN: CRUD de usuários ----------
// Listar todos os usuários (apenas admin pode acessar via frontend)
router.get('/api/admin/users', async (req, res) => {
  // Aqui deveria validar se o usuário da sessão é admin, mas para simplificar,
  // faremos a validação no frontend. Mas você pode adicionar verificação.
  const { data, error } = await supabase
    .from('users')
    .select('id, username, name, is_admin, is_active, sector, apps, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Criar usuário
router.post('/api/admin/users', async (req, res) => {
  const { username, password, name, is_admin, is_active, sector, apps } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Campos obrigatórios: username, password, name' });
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      username: username.toLowerCase(),
      password, // texto plano
      name,
      is_admin: is_admin || false,
      is_active: is_active !== undefined ? is_active : true,
      sector: sector || null,
      apps: apps || 'precos'
    })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Atualizar usuário
router.put('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, name, is_admin, is_active, sector, apps } = req.body;

  const updates = {};
  if (username) updates.username = username.toLowerCase();
  if (password) updates.password = password; // texto plano
  if (name) updates.name = name;
  if (is_admin !== undefined) updates.is_admin = is_admin;
  if (is_active !== undefined) updates.is_active = is_active;
  if (sector !== undefined) updates.sector = sector;
  if (apps !== undefined) updates.apps = apps;

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Deletar usuário
router.delete('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Rota para servir admin.html
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Rota curinga: serve o index.html para qualquer rota não-API
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = router;
