require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Importa os subapps
const portalApp = require('./apps/portal/server');
const precosApp = require('./apps/precos/server');
const compraApp = require('./apps/compra/server'); // <-- NOVO: app de ordens de compra

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requisições (opcional para debug)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Monta os subapps nos respectivos caminhos
app.use('/portal', portalApp);
app.use('/precos', precosApp);
app.use('/compra', compraApp); // <-- NOVO: monta a app de compra em /compra

// Redireciona a raiz para o portal
app.get('/', (req, res) => {
  res.redirect('/portal');
});

// Health check global
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apps: ['portal', 'precos', 'compra'],
    node_version: process.version
  });
});

// 404 global
app.use((req, res) => {
  console.log(`404 - Rota não encontrada: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Rota não encontrada no servidor central' });
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Servidor central rodando na porta ${PORT}`);
  console.log(`📍 Portal: http://localhost:${PORT}/portal`);
  console.log(`📍 Preços: http://localhost:${PORT}/precos`);
  console.log(`📍 Compra: http://localhost:${PORT}/compra`);
  console.log(`📁 Diretório de trabalho: ${__dirname}`);
  console.log('='.repeat(50));
});
