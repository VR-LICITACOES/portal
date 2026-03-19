require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Função para montar uma app se o arquivo existir
function mountApp(route, appPath) {
    const fullPath = path.join(__dirname, appPath);
    if (fs.existsSync(fullPath)) {
        try {
            const appModule = require(fullPath);
            app.use(route, appModule);
            console.log(`Módulo montado em ${route}`);
        } catch (err) {
            console.error(`Erro ao carregar módulo ${route}:`, err.message);
        }
    } else {
        console.log(`Módulo ${route} não encontrado (${fullPath}) – ignorado`);
    }
}

// Monta o portal (obrigatório)
const portalPath = './apps/portal/server';
if (fs.existsSync(path.join(__dirname, portalPath))) {
    const portalApp = require(portalPath);
    app.use('/', portalApp);
} else {
    console.error('Portal não encontrado! Encerrando.');
    process.exit(1);
}

// Lista de aplicações (comente as que ainda não existem ou deixe todas, a função ignorará as ausentes)
const apps = [
    { route: '/licitacoes', path: './apps/licitacoes/server' },
    { route: '/compra', path: './apps/compra/server' },
    { route: '/cotacoes', path: './apps/cotacoes/server' },
    { route: '/faturamento', path: './apps/faturamento/server' },
    { route: '/frete', path: './apps/frete/server' },
    { route: '/lucro', path: './apps/lucro/server' },
    { route: '/pagar', path: './apps/pagar/server' },
    { route: '/precos', path: './apps/precos/server' },
    { route: '/receber', path: './apps/receber/server' },
    { route: '/transportadoras', path: './apps/transportadoras/server' },
    { route: '/vendas', path: './apps/vendas/server' }
];

apps.forEach(appInfo => mountApp(appInfo.route, appInfo.path));

// Rota 404
app.use((req, res) => {
    res.status(404).send('Página não encontrada');
});

app.listen(PORT, () => {
    console.log(`Servidor central rodando na porta ${PORT}`);
});
