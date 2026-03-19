require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Monta a aplicação portal na raiz
const portalApp = require('./apps/portal/server');
app.use('/', portalApp);

app.listen(PORT, () => {
  console.log(`Servidor central rodando na porta ${PORT}`);
});
