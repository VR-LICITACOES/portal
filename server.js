require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
const fs = require('fs'); // para verificar existência de arquivos

const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// ========== CONFIGURAÇÃO SUPABASE ==========
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ========== VERIFICAÇÃO DE ESTRUTURA ==========
console.log('📁 Verificando estrutura de pastas:');
const portalPath = path.join(__dirname, 'apps', 'portal');
const precosPath = path.join(__dirname, 'apps', 'precos');

if (fs.existsSync(portalPath)) {
  console.log(`✅ Portal encontrado em: ${portalPath}`);
  // Lista arquivos para debug
  const files = fs.readdirSync(portalPath);
  console.log('   Arquivos:', files);
} else {
  console.error(`❌ Portal NÃO encontrado em: ${portalPath}`);
}

if (fs.existsSync(precosPath)) {
  console.log(`✅ Preços encontrado em: ${precosPath}`);
  const files = fs.readdirSync(precosPath);
  console.log('   Arquivos:', files);
} else {
  console.error(`❌ Preços NÃO encontrado em: ${precosPath}`);
}

// ========== ARQUIVOS ESTÁTICOS ==========
// Portal (raiz) – serve arquivos diretamente de apps/portal
app.use(express.static(portalPath));

// App Preços (rota /precos) – serve arquivos diretamente de apps/precos
app.use('/precos', express.static(precosPath));

// ========== ROTAS DE API (igual ao anterior, mas sem /public) ==========
// ... (todo o resto das rotas de API permanece igual, apenas removi /public)
// Vou colocar apenas as rotas principais para não ficar muito longo, mas você deve manter as que já tinha.

// ========== ROTAS DE FALLBACK ==========
// Rota raiz: serve index.html do portal
app.get('/', (req, res) => {
  const indexPath = path.join(portalPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html do portal não encontrado');
  }
});

// Rota /precos: serve index.html da app preços
app.get('/precos', (req, res) => {
  const indexPath = path.join(precosPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html de preços não encontrado');
  }
});

// Rota curinga: redireciona para o portal (SPA)
app.get('*', (req, res) => {
  const indexPath = path.join(portalPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Página não encontrada');
  }
});

// ========== INICIA O SERVIDOR ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
