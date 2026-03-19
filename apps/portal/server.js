const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const router = express.Router();

// ✅ Configura o trust proxy para o rate limiter funcionar atrás do Render
router.set('trust proxy', true);

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

router.post('/api/login', limiter, async (req, res) => {
  const { username, password, deviceToken } = req.body;

  try {
    console.log(`🔐 Tentativa de login: ${username}`);

    // ✅ Verifica se as variáveis de ambiente estão definidas
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidas');
      return res.status(500).json({ error: 'Erro de configuração do servidor' });
    }

    // ✅ Consulta na tabela users (se o nome for diferente, ajuste aqui)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, name, is_admin, sector, apps, is_active')
      .eq('username', username.toLowerCase())
      .single();

    if (error) {
      console.error('❌ Erro na consulta:', error.message);
      return res.status(500).json({ error: 'Erro interno no banco de dados' });
    }

    if (!user) {
      console.log(`❌ Usuário não encontrado: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    if (!user.is_active) {
      console.log(`❌ Usuário inativo: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    console.log(`👤 Usuário encontrado: ${user.username}, senha no banco: ${user.password}`);

    // 🔓 COMPARAÇÃO DIRETA (senha em texto plano)
    if (password !== user.password) {
      console.log(`❌ Senha incorreta. Fornecida: ${password}, Esperada: ${user.password}`);
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
    console.error('❌ Erro inesperado:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// ✅ Rota de verificação de sessão
router.post('/api/verify-session', async (req, res) => {
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

// ✅ Rota de logout
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

// ✅ Serve o front-end para qualquer outra rota
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = router;
