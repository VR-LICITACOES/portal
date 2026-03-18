const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// CONFIGURAÇÃO DO SUPABASE (credenciais gerais)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: Variáveis de ambiente do Supabase para PREÇOS não configuradas');
    console.error('   SUPABASE_URL:', supabaseUrl ? 'definido' : 'não definido');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'definido' : 'não definido');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// MIDDLEWARES
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// REGISTRO DE ACESSOS SILENCIOSO
const logFilePath = path.join(__dirname, 'acessos.log');
let accessCount = 0;
let uniqueIPs = new Set();

function registrarAcesso(req, res, next) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const clientIP = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()
        : req.socket.remoteAddress;

    const cleanIP = clientIP.replace('::ffff:', '');
    const logEntry = `[${new Date().toISOString()}] ${cleanIP} - ${req.method} ${req.path}\n`;

    fs.appendFile(logFilePath, logEntry, () => {});
    
    accessCount++;
    uniqueIPs.add(cleanIP);
    
    next();
}

app.use(registrarAcesso);

setInterval(() => {
    if (accessCount > 0) {
        console.log(`📊 Última hora: ${accessCount} requisições de ${uniqueIPs.size} IPs únicos`);
        accessCount = 0;
        uniqueIPs.clear();
    }
}, 3600000);

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL; // ex: https://meusite.onrender.com/portal

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            redirectToLogin: true
        });
    }

    try {
        // Constroi a URL de verificação
        const verifyUrl = `${PORTAL_URL}/api/verify-session`;
        console.log(`🔍 Verificando sessão em: ${verifyUrl}`);

        const verifyResponse = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro ao verificar autenticação'
        });
    }
}

// HEALTH CHECK
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase
            .from('precos')
            .select('count', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            timestamp: new Date().toISOString()
        });
    }
});

// ROTAS DA API
app.use('/api', verificarAutenticacao);

app.head('/api/precos', (req, res) => {
    res.status(200).end();
});

// Listar marcas disponíveis
app.get('/api/marcas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('precos').select('marca');
        if (error) throw error;
        const marcas = [...new Set((data || []).map(r => r.marca?.trim()).filter(Boolean))].sort();
        res.json(marcas);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar marcas' });
    }
});

// Listar preços (com paginação)
app.get('/api/precos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 50);
        const marca = req.query.marca || null;
        const search = req.query.search || null;

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('precos')
            .select('*', { count: 'exact' })
            .order('marca', { ascending: true })
            .order('codigo', { ascending: true });

        if (marca && marca !== 'TODAS') {
            query = query.eq('marca', marca);
        }

        if (search) {
            query = query.or(`codigo.ilike.%${search}%,marca.ilike.%${search}%,descricao.ilike.%${search}%`);
        }

        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            data: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar preços'
        });
    }
});

// Buscar preço específico
app.get('/api/precos/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('precos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Preço não encontrado' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar preço'
        });
    }
});

// Criar preço
app.post('/api/precos', async (req, res) => {
    try {
        const { marca, codigo, preco, descricao } = req.body;

        if (!marca || !codigo || !preco || !descricao) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('precos')
            .insert([{
                marca: marca.trim(),
                codigo: codigo.trim(),
                preco: parseFloat(preco),
                descricao: descricao.trim(),
                timestamp: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao criar preço'
        });
    }
});

// Atualizar preço
app.put('/api/precos/:id', async (req, res) => {
    try {
        const { marca, codigo, preco, descricao } = req.body;

        if (!marca || !codigo || !preco || !descricao) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('precos')
            .update({
                marca: marca.trim(),
                codigo: codigo.trim(),
                preco: parseFloat(preco),
                descricao: descricao.trim(),
                timestamp: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Preço não encontrado' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao atualizar preço'
        });
    }
});

// Deletar preço
app.delete('/api/precos/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('precos')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.status(204).end();
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao excluir preço'
        });
    }
});

// ROTA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404
app.use((req, res) => {
    res.status(404).json({
        error: '404 - Rota não encontrada'
    });
});

// TRATAMENTO DE ERROS
app.use((error, req, res, next) => {
    res.status(500).json({
        error: 'Erro interno do servidor'
    });
});

// Exporta o app para o servidor central
module.exports = app;

// Se executado diretamente, inicia o servidor
if (require.main === module) {
    const PORT = process.env.PORT || 3002;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Tabela de Preços rodando isoladamente na porta ${PORT}`);
    });
}
