const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ==========================================
// ======== CONFIGURAÇÃO DO SUPABASE ========
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: Variáveis de ambiente do Supabase para COMPRA não configuradas');
    console.error('   SUPABASE_URL:', supabaseUrl ? 'definido' : 'não definido');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'definido' : 'não definido');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ======== MIDDLEWARES =====================
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ======== AUTENTICAÇÃO ====================
// ==========================================
const PORTAL_URL = process.env.PORTAL_URL; // ex: https://portal-1ac5.onrender.com/portal

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        console.log('❌ Token ausente na requisição');
        return res.status(401).json({
            error: 'Não autenticado',
            redirectToLogin: true
        });
    }

    try {
        const verifyUrl = `${PORTAL_URL}/api/verify-session`;
        console.log(`🔍 Verificando sessão em: ${verifyUrl} com token: ${sessionToken.substring(0,10)}...`);

        const verifyResponse = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            console.log(`❌ Resposta do portal não ok: ${verifyResponse.status}`);
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();
        console.log('✅ Sessão válida:', sessionData);

        if (!sessionData.valid) {
            console.log('❌ Sessão inválida (valid=false)');
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

// ==========================================
// ======== ROTAS PÚBLICAS ==================
// ==========================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        app: 'ordem-compra',
        supabase: supabaseUrl ? 'configurado' : 'não configurado'
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// ======== ROTAS DA API (protegidas) =======
// ==========================================
app.use('/api', verificarAutenticacao);

// GET /api/ordens - listar ordens do mês
app.get('/api/ordens', async (req, res) => {
    try {
        const mes = parseInt(req.query.mes);
        const ano = parseInt(req.query.ano);
        if (isNaN(mes) || isNaN(ano)) {
            return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
        }

        console.log(`📦 Buscando ordens para mês=${mes}, ano=${ano}`);
        const { data, error } = await supabase
            .from('ordens')
            .select('*')
            .eq('mes', mes)
            .eq('ano', ano)
            .order('numero_ordem', { ascending: true });

        if (error) {
            console.error('Erro no Supabase (ordens):', error);
            throw error;
        }
        res.json(data || []);
    } catch (error) {
        console.error('Erro ao buscar ordens:', error);
        res.status(500).json({ error: 'Erro ao buscar ordens' });
    }
});

// GET /api/ordens/ultimo-numero
app.get('/api/ordens/ultimo-numero', async (req, res) => {
    try {
        console.log('🔢 Buscando último número de ordem');
        const { data, error } = await supabase
            .from('ordens')
            .select('numero_ordem')
            .order('numero_ordem', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Erro no Supabase (ultimo-numero):', error);
            throw error;
        }
        const ultimoNumero = data && data.length > 0 ? data[0].numero_ordem : 0;
        res.json({ ultimoNumero });
    } catch (error) {
        console.error('Erro ao buscar último número:', error);
        res.status(500).json({ error: 'Erro ao buscar último número' });
    }
});

// GET /api/fornecedores - lista de fornecedores únicos (para autocomplete)
app.get('/api/fornecedores', async (req, res) => {
    try {
        console.log('👥 Buscando fornecedores');
        const { data, error } = await supabase
            .from('ordens')
            .select('razao_social, nome_fantasia, cnpj, endereco_fornecedor, site, contato, telefone, email')
            .not('razao_social', 'is', null)
            .order('razao_social');

        if (error) {
            console.error('Erro no Supabase (fornecedores):', error);
            throw error;
        }

        // Remove duplicatas baseado na razão social
        const unique = [];
        const seen = new Set();
        data.forEach(item => {
            if (item.razao_social && !seen.has(item.razao_social)) {
                seen.add(item.razao_social);
                unique.push(item);
            }
        });
        res.json(unique);
    } catch (error) {
        console.error('Erro ao buscar fornecedores:', error);
        res.status(500).json({ error: 'Erro ao buscar fornecedores' });
    }
});

// GET /api/ordens/:id
app.get('/api/ordens/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ordens')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Ordem não encontrada' });
        }
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar ordem:', error);
        res.status(500).json({ error: 'Erro ao buscar ordem' });
    }
});

// POST /api/ordens
app.post('/api/ordens', async (req, res) => {
    try {
        const ordem = req.body;
        const dataAtual = new Date();
        const mes = dataAtual.getMonth();
        const ano = dataAtual.getFullYear();

        console.log('➕ Criando nova ordem:', ordem.numero_ordem);

        const { data, error } = await supabase
            .from('ordens')
            .insert([{
                ...ordem,
                mes,
                ano,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error('Erro no Supabase (insert):', error);
            throw error;
        }
        res.status(201).json(data);
    } catch (error) {
        console.error('Erro ao criar ordem:', error);
        res.status(500).json({ error: 'Erro ao criar ordem' });
    }
});

// PUT /api/ordens/:id
app.put('/api/ordens/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ordens')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Ordem não encontrada' });
        }
        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar ordem:', error);
        res.status(500).json({ error: 'Erro ao atualizar ordem' });
    }
});

// PATCH /api/ordens/:id/status
app.patch('/api/ordens/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const { data, error } = await supabase
            .from('ordens')
            .update({ status })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Ordem não encontrada' });
        }
        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});

// DELETE /api/ordens/:id
app.delete('/api/ordens/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('ordens')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.status(204).end();
    } catch (error) {
        console.error('Erro ao deletar ordem:', error);
        res.status(500).json({ error: 'Erro ao deletar ordem' });
    }
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// ==========================================
// ======== TRATAMENTO DE ERROS =============
// ==========================================
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ==========================================
// ======== EXPORTA APP =====================
// ==========================================
module.exports = app;

// Se executado diretamente, inicia o servidor
if (require.main === module) {
    const PORT = process.env.PORT || 3003;
    app.listen(PORT, () => {
        console.log(`✅ Ordem de Compra rodando isoladamente na porta ${PORT}`);
        console.log(`📍 Portal URL: ${PORTAL_URL}`);
        console.log(`📍 Supabase URL: ${supabaseUrl}`);
    });
}
