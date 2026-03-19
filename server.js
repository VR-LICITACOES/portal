require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Monta a aplicação portal na raiz (ela gerencia autenticação e front-end)
const portalApp = require('./apps/portal/server');
app.use('/', portalApp);

// Monta as demais aplicações em sub-rotas
app.use('/licitacoes', require('./apps/licitacoes/server'));
app.use('/compra', require('./apps/compra/server'));
app.use('/cotacoes', require('./apps/cotacoes/server'));
app.use('/faturamento', require('./apps/faturamento/server'));
app.use('/frete', require('./apps/frete/server'));
app.use('/lucro', require('./apps/lucro/server'));
app.use('/pagar', require('./apps/pagar/server'));
app.use('/precos', require('./apps/precos/server'));
app.use('/receber', require('./apps/receber/server'));
app.use('/transportadoras', require('./apps/transportadoras/server'));
app.use('/vendas', require('./apps/vendas/server'));

// Se alguma rota não for encontrada, retorna 404
app.use((req, res) => {
  res.status(404).send('Página não encontrada');
});

app.listen(PORT, () => {
  console.log(`Servidor central rodando na porta ${PORT}`);
});
