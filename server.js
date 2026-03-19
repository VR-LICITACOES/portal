require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy configurado (necessário atrás do Render)
app.set('trust proxy', true);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve arquivos estáticos da raiz public/

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Rate limiter para login (desabilita validação do trust proxy para evitar warning)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas, tente novamente mais tarde.' },
  validate: { trustProxy: false }
});

// ========== ROTAS DE API ==========

// Rota para obter IP público
app.get('/api/ip', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip });
});

// Rota de login
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
      console.log(`❌ Usuário não encontrado: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    if (!user.is_active) {
      console.log(`❌ Usuário inativo: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Comparação direta de senha (texto plano)
    if (password !== user.password) {
      console.log(`❌ Senha incorreta para: ${username}`);
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

// Rota de verificação de sessão
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

// Rota de logout
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

// ========== ROTAS PARA AS APPS (front-ends) ==========

// Serve cada app em sua respectiva rota
app.use('/licitacoes', express.static(path.join(__dirname, 'public/apps/licitacoes')));
app.use('/compra', express.static(path.join(__dirname, 'public/apps/compra')));
app.use('/cotacoes', express.static(path.join(__dirname, 'public/apps/cotacoes')));
app.use('/faturamento', express.static(path.join(__dirname, 'public/apps/faturamento')));
app.use('/frete', express.static(path.join(__dirname, 'public/apps/frete')));
app.use('/lucro', express.static(path.join(__dirname, 'public/apps/lucro')));
app.use('/pagar', express.static(path.join(__dirname, 'public/apps/pagar')));
app.use('/precos', express.static(path.join(__dirname, 'public/apps/precos')));
app.use('/receber', express.static(path.join(__dirname, 'public/apps/receber')));
app.use('/transportadoras', express.static(path.join(__dirname, 'public/apps/transportadoras')));
app.use('/vendas', express.static(path.join(__dirname, 'public/apps/vendas')));

// Redireciona rotas antigas (opcional): ex: /vendas-miguel -> /vendas
app.get('/vendas-miguel', (req, res) => res.redirect('/vendas'));
app.get('/vendas-isaque', (req, res) => res.redirect('/vendas'));

// Rota curinga: para qualquer outra rota, serve o index.html (SPA do portal)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
