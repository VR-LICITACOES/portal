const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const router = express.Router();

// Configuração do Supabase (as variáveis vêm do .env da raiz)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middlewares
router.use(cors());
router.use(express.json());
router.use(express.static(path.join(__dirname, 'public'))); // arquivos estáticos do front

// Limitação de taxa para rotas de login
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 tentativas
  message: { error: 'Muitas tentativas, tente novamente mais tarde.' }
});

// Rota para obter IP público (usada pelo front)
router.get('/api/ip', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip });
});

// Rota de login
router.post('/api/login', limiter, async (req, res) => {
  const { username, password, deviceToken } = req.body;

  try {
    // Busca usuário pelo username
    const { data: user, error } = await supabase
      .from('portal_users')
      .select('id, username, password_hash, name, sector, permissions')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Verifica a senha
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Gera token de sessão (simples: UUID)
    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias

    // Captura IP
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Salva sessão no Supabase
    const { error: sessionError } = await supabase
      .from('portal_sessions')
      .insert({
        session_token: sessionToken,
        user_id: user.id,
        device_token: deviceToken,
        ip_address: ipAddress,
        expires_at: expiresAt.toISOString()
      });

    if (sessionError) {
      console.error('Erro ao criar sessão:', sessionError);
      return res.status(500).json({ error: 'Erro interno ao criar sessão' });
    }

    // Retorna dados da sessão (sem password_hash)
    res.json({
      success: true,
      session: {
        username: user.username,
        name: user.name,
        sector: user.sector,
        permissions: user.permissions,
        sessionToken,
        deviceToken,
        expiresAt
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota para verificar sessão
router.post('/api/verify-session', async (req, res) => {
  const { sessionToken } = req.body;

  try {
    const { data: session, error } = await supabase
      .from('portal_sessions')
      .select('*, portal_users(*)')
      .eq('session_token', sessionToken)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !session) {
      return res.json({ valid: false });
    }

    res.json({ valid: true, user: session.portal_users });
  } catch (err) {
    res.json({ valid: false });
  }
});

// Rota de logout
router.post('/api/logout', async (req, res) => {
  const { sessionToken, deviceToken } = req.body;

  try {
    await supabase
      .from('portal_sessions')
      .delete()
      .eq('session_token', sessionToken)
      .eq('device_token', deviceToken);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
});

// Rota padrão para servir o index.html (qualquer rota não-API)
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = router;
