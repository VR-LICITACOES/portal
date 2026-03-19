require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

function loadApp(route, appPath) {
  const fullPath = path.join(__dirname, appPath);
  if (fs.existsSync(fullPath)) {
    try {
      const appModule = require(fullPath);
      app.use(route, appModule);
      console.log(`✅ App carregada: ${route} -> ${appPath}`);
    } catch (err) {
      console.error(`❌ Erro ao carregar ${appPath}:`, err.message);
    }
  } else {
    console.log(`⚠️ App não encontrada: ${appPath} – rota ${route} indisponível`);
    app.use(route, (req, res) => {
      res.status(501).send(`Aplicação ${route} ainda não implementada.`);
    });
  }
}

const portalPath = './apps/portal/server.js';
if (!fs.existsSync(path.join(__dirname, portalPath))) {
  console.error('❌ ERRO: Portal não encontrado! Encerrando.');
  process.exit(1);
}
const portalApp = require(portalPath);
app.use('/', portalApp);
console.log('✅ Portal carregado.');

// Demais apps (opcionais) - descomente quando criar as pastas
// loadApp('/licitacoes', './apps/licitacoes/server.js');
// loadApp('/compra', './apps/compra/server.js');
// ...

app.use((req, res) => {
  res.status(404).send('Página não encontrada');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
