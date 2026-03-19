require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ========== ROTAS DE ARQUIVOS ESTÁTICOS DAS APPS ==========

// Portal (raiz)
app.use(express.static(path.join(__dirname, 'apps', 'portal', 'public')));

// App Preços (rota /precos)
app.use('/precos', express.static(path.join(__dirname, 'apps', 'precos', 'public')));

// ========== MIDDLEWARE DE AUTENTICAÇÃO (usado nas rotas de API) ==========
async function authenticate(req, res, next) {
  const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Token de sessão não fornecido' });
  }

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, users(*)')
      .eq('session_token', sessionToken)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !session) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    }

    req.user = session.users; // anexa o usuário para uso posterior, se necessário
    next();
  } catch (err) {
    console.error('Erro na autenticação:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// ========== ROTAS DE API DO PORTAL (já existentes) ==========
// ... (manter as rotas /api/login, /api/verify-session, /api/logout, /api/ip)
// Para brevidade, não repetirei aqui, mas elas devem permanecer no código.

// ========== ROTAS DE API DA APLICAÇÃO PREÇOS ==========

// GET /api/marcas – retorna lista de marcas distintas
app.get('/api/marcas', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('marca')
      .order('marca');

    if (error) throw error;

    const marcas = [...new Set(data.map(item => item.marca).filter(Boolean))].sort();
    res.json(marcas);
  } catch (err) {
    console.error('Erro ao buscar marcas:', err);
    res.status(500).json({ error: 'Erro ao buscar marcas' });
  }
});

// GET /api/precos – listagem paginada com filtros
app.get('/api/precos', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const { marca, search } = req.query;

  try {
    let query = supabase
      .from('precos')
      .select('*', { count: 'exact' });

    if (marca && marca !== 'TODAS') {
      query = query.eq('marca', marca);
    }

    if (search) {
      const term = `%${search}%`;
      query = query.or(`codigo.ilike.${term},descricao.ilike.${term},marca.ilike.${term}`);
    }

    const { data, error, count } = await query
      .order('marca')
      .order('codigo')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error('Erro ao buscar preços:', err);
    res.status(500).json({ error: 'Erro ao buscar preços' });
  }
});

// POST /api/precos – criar novo preço
app.post('/api/precos', authenticate, async (req, res) => {
  const { marca, codigo, preco, descricao } = req.body;

  if (!marca || !codigo || !preco || !descricao) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('precos')
      .insert([{
        marca: marca.trim(),
        codigo: codigo.trim(),
        preco: parseFloat(preco),
        descricao: descricao.trim().toUpperCase(),
        timestamp: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro ao criar preço:', err);
    res.status(500).json({ error: 'Erro ao criar preço' });
  }
});

// PUT /api/precos/:id – atualizar preço existente
app.put('/api/precos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { marca, codigo, preco, descricao } = req.body;

  try {
    const { data, error } = await supabase
      .from('precos')
      .update({
        marca: marca.trim(),
        codigo: codigo.trim(),
        preco: parseFloat(preco),
        descricao: descricao.trim().toUpperCase(),
        timestamp: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Preço não encontrado' });
    }
    res.json(data[0]);
  } catch (err) {
    console.error('Erro ao atualizar preço:', err);
    res.status(500).json({ error: 'Erro ao atualizar preço' });
  }
});

// DELETE /api/precos/:id – excluir preço
app.delete('/api/precos/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('precos')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar preço:', err);
    res.status(500).json({ error: 'Erro ao deletar preço' });
  }
});

// ========== ROTA CURINGA PARA O PORTAL (SPA) ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'portal', 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
