require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rota para o portal (autenticação e front-end)
// O portal será servido diretamente por esta instância, pois é a porta de entrada.
// Mas para manter a modularidade, vamos montar o app do portal como middleware.
const portalApp = require('./apps/portal/server'); // deve exportar uma função ou app
app.use('/portal', portalApp); // tudo que começa com /portal vai para o portal

// Se quiser que o portal seja a raiz (ex: sem prefixo), pode fazer:
// app.use('/', portalApp);

// Para as outras apps, usamos proxy ou montagem similar.
// Exemplo: app.use('/licitacoes', require('./apps/licitacoes/server'));

app.listen(PORT, () => {
  console.log(`Servidor central rodando na porta ${PORT}`);
});
