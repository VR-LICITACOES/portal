require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.static(path.join(__dirname, 'apps', 'portal')));
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas, tente novamente mais tarde.' },
  validate: false
});

app.get('/api/ip', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip });
});

app.post('/api/login', limiter, async (req, res) => {
  const { username, password, deviceToken } = req.body;

  try {
    console.log(`\n🔐 Tentativa de login: ${username}`);
    console.log(`Senha fornecida: '${password}'`);

    // 🔍 1. Lista TODOS os usuários da tabela
    const { data: allUsers, error: allError } = await supabase
      .from('users')
      .select('username, password');

    if (allError) {
      console.error('❌ Erro ao listar usuários:', allError);
    } else {
      console.log('📋 Usuários encontrados no banco:');
      if (allUsers.length === 0) {
        console.log('   Nenhum usuário cadastrado!');
      } else {
        allUsers.forEach(u => console.log(`   - ${u.username} : senha '${u.password}'`));
      }
    }

    // 🔍 2. Consulta específica
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, name, is_admin, sector, apps, is_active')
      .eq('username', username.toLowerCase())
      .single();

    if (error) {
      console.log(`❌ Erro na consulta específica: ${error.message}`);
    }

    if (!user) {
      console.log(`❌ Usuário '${username.toLowerCase()}' NÃO encontrado.`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    console.log(`✅ Usuário encontrado: ${user.username}`);
    console.log(`   Senha no banco: '${user.password}'`);
    console.log(`   Senha fornecida: '${password}'`);

    if (!user.is_active) {
      console.log(`❌ Usuário inativo.`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    if (password !== user.password) {
      console.log(`❌ SENHA INCORRETA.`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    console.log(`✅ Senha OK, criando sessão...`);

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'portal', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
