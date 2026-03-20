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

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('fornecedoresSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('fornecedoresSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="/" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    carregarFornecedores();

    setInterval(async () => {
        const online = await verificarConexao();
        if (online && !isOnline) {
            isOnline = true;
            updateConnectionStatus();
            carregarFornecedores();
        } else if (!online && isOnline) {
            isOnline = false;
            updateConnectionStatus();
        }
    }, 15000);

    setInterval(() => {
        if (isOnline && !state.isLoading) carregarFornecedores(state.currentPage);
    }, 30000);
}

function getHeaders() {
    const headers = { 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    return headers;
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal, mode: 'cors' });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

function updateConnectionStatus() {
    const el = document.getElementById('connectionStatus');
    if (el) el.className = isOnline ? 'connection-status online' : 'connection-status offline';
}

async function verificarConexao() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/fornecedores?page=1&limit=1`, {
            method: 'GET',
            headers: getHeaders()
        });
        if (response.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }
        return response.ok;
    } catch {
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

        const response = await fetchWithTimeout(`${API_URL}/fornecedores?${params}`, {
            method: 'GET',
            headers: getHeaders()
        });

        if (response.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            console.error('❌ Erro ao carregar fornecedores:', response.status);
            return;
        }

        const result = await response.json();
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

let searchDebounceTimer = null;
function filterFornecedores() {
    state.searchTerm = document.getElementById('search').value.trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        carregarFornecedores(1);
    }, 200);
}

function renderFornecedores() {
    const tbody = document.getElementById('fornecedoresTableBody');
    if (!tbody) return;

    if (!state.fornecedores.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">Nenhum fornecedor encontrado</td></tr>`;
        return;
    }

    tbody.innerHTML = state.fornecedores.map(f => {
        const metodo = f.metodo_envio === 'whatsapp' ? 'WhatsApp' : 'E-mail';
        return `
        <tr>
            <td><strong>${f.nome}</strong></td>
            <td>${f.telefone || '-'}</td>
            <td>${f.celular || '-'}</td>
            <td>${f.email || '-'}</td>
            <td>${metodo}</td>
            <td style="color: var(--text-secondary); font-size:0.85rem;">${getTimeAgo(f.timestamp)}</td>
            <td class="actions-cell">
                <button onclick="editFornecedor('${f.id}')" class="action-btn edit">Editar</button>
                <button onclick="deleteFornecedor('${f.id}')" class="action-btn delete">Excluir</button>
            </td>
        </tr>
    `}).join('');
}

function renderPaginacao() {
    const existing = document.getElementById('paginacaoContainer');
    if (existing) existing.remove();

    const tableCard = document.querySelector('.table-card');
    if (!tableCard) return;

    const total = state.totalPages;
    const atual = state.currentPage;
    const inicio = state.totalRecords === 0 ? 0 : (atual - 1) * PAGE_SIZE + 1;
    const fim = Math.min(atual * PAGE_SIZE, state.totalRecords);

    let paginas = [];
    if (total <= 7) {
        for (let i = 1; i <= total; i++) paginas.push(i);
    } else {
        paginas.push(1);
        if (atual > 3) paginas.push('...');
        for (let i = Math.max(2, atual - 1); i <= Math.min(total - 1, atual + 1); i++) paginas.push(i);
        if (atual < total - 2) paginas.push('...');
        paginas.push(total);
    }

    const botoesHTML = paginas.map(p =>
        p === '...' ? '<span class="pag-ellipsis">…</span>' :
        `<button class="pag-btn ${p === atual ? 'pag-btn-active' : ''}" onclick="carregarFornecedores(${p})">${p}</button>`
    ).join('');

    const div = document.createElement('div');
    div.id = 'paginacaoContainer';
    div.className = 'paginacao-wrapper';
    div.innerHTML = `
        <div class="paginacao-info">
            ${state.totalRecords > 0 ? `Exibindo ${inicio}–${fim} de ${state.totalRecords} registros` : 'Nenhum registro'}
        </div>
        <div class="paginacao-btns">
            <button class="pag-btn pag-nav" onclick="carregarFornecedores(${atual - 1})" ${atual === 1 ? 'disabled' : ''}>‹</button>
            ${botoesHTML}
            <button class="pag-btn pag-nav" onclick="carregarFornecedores(${atual + 1})" ${atual === total ? 'disabled' : ''}>›</button>
        </div>
    `;
    tableCard.appendChild(div);
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Sem data';
    const now = new Date();
    const past = new Date(timestamp);
    const diff = Math.floor((now - past) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return past.toLocaleDateString('pt-BR');
}

// Abas do modal
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });
}

// Formulário
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const fornecedor = isEditing ? state.fornecedores.find(f => f.id === editingId) : null;

    // Remove modais antigos
    const oldModal = document.getElementById('formModal');
    if (oldModal) oldModal.remove();

    // Insere o HTML do modal (já está no index, mas vamos garantir que não haja duplicatas)
    // Na verdade o modal já existe no HTML, apenas vamos preenchê-lo e exibi-lo
    const modal = document.getElementById('formModal');
    if (!modal) return;

    document.getElementById('modalEditId').value = editingId || '';
    document.getElementById('modalTitle').textContent = isEditing ? 'Editar Fornecedor' : 'Novo Fornecedor';
    document.getElementById('modalNome').value = fornecedor?.nome || '';
    document.getElementById('modalTelefone').value = fornecedor?.telefone || '';
    document.getElementById('modalCelular').value = fornecedor?.celular || '';
    document.getElementById('modalEmail').value = fornecedor?.email || '';

    // Radio button
    const radios = document.querySelectorAll('input[name="metodoEnvio"]');
    radios.forEach(r => {
        if (r.value === (fornecedor?.metodo_envio || 'whatsapp')) {
            r.checked = true;
        }
    });

    // Reset tabs para "Geral"
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-button[data-tab="geral"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-geral').classList.add('active');

    modal.classList.add('show');
    initTabs(); // re-inicializa as abas
}

window.closeFormModal = function() {
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.classList.remove('show');
    }
};

async function handleSubmit(event) {
    event.preventDefault();

    const editId = document.getElementById('modalEditId').value;
    const metodoEnvio = document.querySelector('input[name="metodoEnvio"]:checked')?.value || 'whatsapp';

    const formData = {
        nome: document.getElementById('modalNome').value.trim(),
        telefone: document.getElementById('modalTelefone').value.trim() || null,
        celular: document.getElementById('modalCelular').value.trim() || null,
        email: document.getElementById('modalEmail').value.trim() || null,
        metodo_envio: metodoEnvio
    };

    if (!formData.nome) {
        showToast('Nome do fornecedor é obrigatório', 'error');
        return;
    }

    if (!isOnline) {
        showToast('Sistema offline', 'error');
        closeFormModal();
        return;
    }

    try {
        const headers = { 'Content-Type': 'application/json', ...getHeaders() };
        const response = await fetchWithTimeout(
            editId ? `${API_URL}/fornecedores/${editId}` : `${API_URL}/fornecedores`,
            { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(formData) },
            15000
        );

        if (response.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Erro ${response.status}`);
        }

        closeFormModal();
        showToast(editId ? 'Fornecedor atualizado' : 'Fornecedor registrado', 'success');
        carregarFornecedores(editId ? state.currentPage : 1);

    } catch (error) {
        showToast(error.name === 'AbortError' ? 'Timeout: Operação demorou muito' : `Erro: ${error.message}`, 'error');
    }
}

window.editFornecedor = function(id) {
    showFormModal(id);
};

window.deleteFornecedor = function(id) {
    state.deleteId = id;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.add('show');
};

window.closeDeleteModal = function() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.remove('show');
    state.deleteId = null;
};

window.confirmDelete = async function() {
    const id = state.deleteId;
    if (!id) return;
    closeDeleteModal();
    if (!isOnline) {
        showToast('Sistema offline. Não foi possível excluir.', 'error');
        return;
    }

    try {
        const response = await fetchWithTimeout(`${API_URL}/fornecedores/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (response.status === 401) {
            sessionStorage.removeItem('fornecedoresSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        showToast('Fornecedor excluído com sucesso!', 'success');

        const pageToLoad = state.fornecedores.length === 1 && state.currentPage > 1
            ? state.currentPage - 1
            : state.currentPage;

        carregarFornecedores(pageToLoad);

    } catch (error) {
        showToast(error.name === 'AbortError' ? 'Timeout: Operação demorou muito' : 'Erro ao excluir fornecedor', 'error');
    }
};

function showToast(message, type = 'success') {
    const existing = document.querySelectorAll('.floating-message');
    existing.forEach(m => m.remove());
    const div = document.createElement('div');
    div.className = `floating-message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// Expor funções globalmente
window.filterFornecedores = filterFornecedores;
window.carregarFornecedores = carregarFornecedores;
