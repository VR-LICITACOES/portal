const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3002/api'
    : `${window.location.origin}/api`;

const PAGE_SIZE = 50;

let state = {
    fornecedores: [],
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    searchTerm: '',
    isLoading: false,
    deleteId: null
};

let isOnline = false;
let sessionToken = null;

console.log('🚀 Fornecedores iniciado');
console.log('📍 API URL:', API_URL);

document.addEventListener('DOMContentLoaded', verificarAutenticacao);

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');
    sessionToken = tokenFromUrl || sessionStorage.getItem('fornecedoresSession');
    if (tokenFromUrl) {
        sessionStorage.setItem('fornecedoresSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (!sessionToken) return mostrarTelaAcessoNegado();
    inicializarApp();
}

function mostrarTelaAcessoNegado() {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">NÃO AUTORIZADO</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="/" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    carregarFornecedores();
    setInterval(verificarConexao, 15000);
    setInterval(() => { if (isOnline && !state.isLoading) carregarFornecedores(state.currentPage); }, 30000);
}

function getHeaders() {
    const h = { Accept: 'application/json' };
    if (sessionToken) h['X-Session-Token'] = sessionToken;
    return h;
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal, mode: 'cors' });
        clearTimeout(tid);
        return res;
    } catch (err) {
        clearTimeout(tid);
        throw err;
    }
}

function updateConnectionStatus() {
    const el = document.getElementById('connectionStatus');
    if (el) el.className = isOnline ? 'connection-status online' : 'connection-status offline';
}

async function verificarConexao() {
    try {
        const res = await fetchWithTimeout(`${API_URL}/fornecedores?page=1&limit=1`, {
            method: 'GET',
            headers: getHeaders()
        });
        if (res.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }
        isOnline = res.ok;
        updateConnectionStatus();
        return res.ok;
    } catch {
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

async function carregarFornecedores(page = 1) {
    if (state.isLoading) return;
    state.isLoading = true;
    state.currentPage = page;

    try {
        const params = new URLSearchParams({ page, limit: PAGE_SIZE });
        if (state.searchTerm) params.set('search', state.searchTerm);

        const res = await fetchWithTimeout(`${API_URL}/fornecedores?${params}`, {
            method: 'GET',
            headers: getHeaders()
        });

        if (res.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!res.ok) {
            console.error('❌ Erro ao carregar fornecedores:', res.status);
            return;
        }

        const result = await res.json();
        state.fornecedores = result.data || [];
        state.totalRecords = result.total || 0;
        state.totalPages = result.totalPages || 1;
        state.currentPage = result.page || page;

        isOnline = true;
        updateConnectionStatus();
        renderFornecedores();
        renderPaginacao();

    } catch (error) {
        console.error(error.name === 'AbortError' ? '❌ Timeout' : '❌ Erro:', error);
    } finally {
        state.isLoading = false;
    }
}

let searchDebounceTimer;
function filterFornecedores() {
    state.searchTerm = document.getElementById('search').value.trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => carregarFornecedores(1), 200);
}

function renderFornecedores() {
    const tbody = document.getElementById('fornecedoresTableBody');
    if (!tbody) return;
    if (!state.fornecedores.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">Nenhum fornecedor encontrado</td></tr>`;
        return;
    }
    tbody.innerHTML = state.fornecedores.map(f => `
        <tr>
            <td><strong>${f.nome}</strong></td>
            <td>${f.telefone || '-'}</td>
            <td>${f.celular || '-'}</td>
            <td>${f.email || '-'}</td>
            <td>${f.metodo_envio === 'whatsapp' ? 'WhatsApp' : 'E-mail'}</td>
            <td style="color: var(--text-secondary); font-size:0.85rem;">${getTimeAgo(f.timestamp)}</td>
            <td class="actions-cell">
                <button onclick="editFornecedor('${f.id}')" class="action-btn edit">Editar</button>
                <button onclick="deleteFornecedor('${f.id}')" class="action-btn delete">Excluir</button>
            </td>
        </tr>
    `).join('');
}

function renderPaginacao() {
    const existing = document.getElementById('paginacaoContainer');
    if (existing) existing.remove();
    const tableCard = document.querySelector('.table-card');
    if (!tableCard) return;
    const total = state.totalPages;
    const atual = state.currentPage;
    const inicio = state.totalRecords ? (atual-1)*PAGE_SIZE+1 : 0;
    const fim = Math.min(atual*PAGE_SIZE, state.totalRecords);

    let paginas = [];
    if (total <= 7) {
        for (let i=1; i<=total; i++) paginas.push(i);
    } else {
        paginas.push(1);
        if (atual > 3) paginas.push('...');
        for (let i=Math.max(2, atual-1); i<=Math.min(total-1, atual+1); i++) paginas.push(i);
        if (atual < total-2) paginas.push('...');
        paginas.push(total);
    }

    const botoes = paginas.map(p =>
        p === '...' ? '<span class="pag-ellipsis">…</span>' :
        `<button class="pag-btn ${p === atual ? 'pag-btn-active' : ''}" onclick="carregarFornecedores(${p})">${p}</button>`
    ).join('');

    const div = document.createElement('div');
    div.id = 'paginacaoContainer';
    div.className = 'paginacao-wrapper';
    div.innerHTML = `
        <div class="paginacao-info">${state.totalRecords ? `Exibindo ${inicio}–${fim} de ${state.totalRecords} registros` : 'Nenhum registro'}</div>
        <div class="paginacao-btns">
            <button class="pag-btn pag-nav" onclick="carregarFornecedores(${atual-1})" ${atual===1?'disabled':''}>‹</button>
            ${botoes}
            <button class="pag-btn pag-nav" onclick="carregarFornecedores(${atual+1})" ${atual===total?'disabled':''}>›</button>
        </div>
    `;
    tableCard.appendChild(div);
}

function getTimeAgo(ts) {
    if (!ts) return 'Sem data';
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff/60)}min`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d`;
    return new Date(ts).toLocaleDateString('pt-BR');
}

// ========== NOVAS FUNÇÕES PARA AS CAIXAS DE SELEÇÃO ==========
function selectEnvio(element) {
    document.querySelectorAll('.envio-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('metodoEnvio').value = element.dataset.value;
}

window.selectEnvio = selectEnvio;

// ========== FORMULÁRIO ==========
window.toggleForm = () => showFormModal(null);

function showFormModal(editId = null) {
    const isEdit = editId !== null;
    const f = isEdit ? state.fornecedores.find(f => f.id === editId) : null;
    const modal = document.getElementById('formModal');
    if (!modal) return;
    document.getElementById('modalEditId').value = editId || '';
    document.getElementById('modalTitle').textContent = isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor';
    document.getElementById('modalNome').value = f?.nome || '';
    document.getElementById('modalTelefone').value = f?.telefone || '';
    document.getElementById('modalCelular').value = f?.celular || '';
    document.getElementById('modalEmail').value = f?.email || '';

    // Marca a opção de envio
    const metodo = f?.metodo_envio || 'whatsapp';
    document.getElementById('metodoEnvio').value = metodo;
    document.querySelectorAll('.envio-option').forEach(opt => {
        if (opt.dataset.value === metodo) {
            opt.classList.add('selected');
        } else {
            opt.classList.remove('selected');
        }
    });

    modal.classList.add('show');
}

window.closeFormModal = () => document.getElementById('formModal')?.classList.remove('show');

async function handleSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('modalEditId').value;
    const data = {
        nome: document.getElementById('modalNome').value.trim(),
        telefone: document.getElementById('modalTelefone').value.trim() || null,
        celular: document.getElementById('modalCelular').value.trim() || null,
        email: document.getElementById('modalEmail').value.trim() || null,
        metodo_envio: document.getElementById('metodoEnvio').value
    };
    if (!data.nome) return showToast('Nome obrigatório', 'error');
    if (!isOnline) return showToast('Offline', 'error') || closeFormModal();

    try {
        const res = await fetchWithTimeout(
            id ? `${API_URL}/fornecedores/${id}` : `${API_URL}/fornecedores`,
            { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify(data) },
            15000
        );
        if (res.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            return mostrarTelaAcessoNegado('Sessão expirada');
        }
        if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Erro');
        closeFormModal();
        showToast(id ? 'Atualizado' : 'Registrado', 'success');
        carregarFornecedores(id ? state.currentPage : 1);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.editFornecedor = showFormModal;
window.deleteFornecedor = (id) => {
    state.deleteId = id;
    document.getElementById('deleteModal')?.classList.add('show');
};
window.closeDeleteModal = () => {
    document.getElementById('deleteModal')?.classList.remove('show');
    state.deleteId = null;
};
window.confirmDelete = async () => {
    const id = state.deleteId;
    closeDeleteModal();
    if (!id || !isOnline) return showToast('Offline', 'error');
    try {
        const res = await fetchWithTimeout(`${API_URL}/fornecedores/${id}`, { method: 'DELETE', headers: getHeaders() });
        if (res.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            return mostrarTelaAcessoNegado('Sessão expirada');
        }
        if (!res.ok) throw new Error();
        showToast('Excluído', 'success');
        const novaPagina = state.fornecedores.length === 1 && state.currentPage > 1 ? state.currentPage - 1 : state.currentPage;
        carregarFornecedores(novaPagina);
    } catch {
        showToast('Erro ao excluir', 'error');
    }
};

function showToast(msg, tipo = 'success') {
    document.querySelectorAll('.floating-message').forEach(m => m.remove());
    const d = document.createElement('div');
    d.className = `floating-message ${tipo}`;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => {
        d.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => d.remove(), 300);
    }, 3000);
}

// Expor funções globalmente
window.filterFornecedores = filterFornecedores;
window.carregarFornecedores = carregarFornecedores;
