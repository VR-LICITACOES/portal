require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Função para carregar uma app se o arquivo existir
function loadApp(route, appPath) {
  const fullPath = path.join(__dirname, appPath);
  if (fs.existsSync(fullPath)) {
    try {
      const appModule = require(fullPath);
      app.use(route, appModule);
      console.log(`✅ App carregado: ${route} -> ${appPath}`);
    } catch (err) {
      console.error(`❌ Erro ao carregar ${appPath}:`, err.message);
    }
  } else {
    console.log(`⚠️ App não encontrado: ${appPath} - rota ${route} não disponível`);
    // Opcional: middleware temporário
    app.use(route, (req, res) => {
      res.status(501).send(`Aplicação ${route} ainda não implementada.`);
    });
  }
}

// Carrega o portal (obrigatório)
const portalPath = './apps/portal/server.js';
if (!fs.existsSync(path.join(__dirname, portalPath))) {
  console.error('❌ ERRO: Portal não encontrado! Certifique-se de que apps/portal/server.js existe.');
  process.exit(1);
}
const portalApp = require(portalPath);
app.use('/', portalApp);
console.log('✅ Portal carregado com sucesso.');

// Carrega as demais apps (opcionais)
loadApp('/licitacoes', './apps/licitacoes/server.js');
loadApp('/compra', './apps/compra/server.js');
loadApp('/cotacoes', './apps/cotacoes/server.js');
loadApp('/faturamento', './apps/faturamento/server.js');
loadApp('/frete', './apps/frete/server.js');
loadApp('/lucro', './apps/lucro/server.js');
loadApp('/pagar', './apps/pagar/server.js');
loadApp('/precos', './apps/precos/server.js');
loadApp('/receber', './apps/receber/server.js');
loadApp('/transportadoras', './apps/transportadoras/server.js');
loadApp('/vendas', './apps/vendas/server.js');

// Rota 404 padrão
app.use((req, res) => {
  res.status(404).send('Página não encontrada');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor central rodando na porta ${PORT}`);
});
