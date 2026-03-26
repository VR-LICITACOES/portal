// ========== CONFIGURAÇÃO ==========
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:10000/api'
    : `${window.location.origin}/api`;

let licitacoes = [];
let itens = [];
let currentLicitacaoId = null;
let editingId = null;
let editingItemId = null;
let isOnline = false;
let sessionToken = null;
let consecutive401Count = 0;
const MAX_401_BEFORE_LOGOUT = 3;
let currentMonth = new Date();
let currentFetchController = null;
let vencidosPage = 1;
const VENCIDOS_PAGE_SIZE = 3;

console.log('🚀 Licitações iniciada');
console.log('📍 API URL:', API_URL);

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
    updateMonthDisplay();
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    setInterval(() => { if (isOnline) loadLicitacoes(); }, 30000);
    setInterval(verificarPrazosVencidos, 60000);
});

// ========== AUTENTICAÇÃO ==========
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');
    sessionToken = tokenFromUrl || sessionStorage.getItem('licitacoesSession');
    if (tokenFromUrl) {
        sessionStorage.setItem('licitacoesSession', tokenFromUrl);
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
    loadLicitacoes();
}

// ========== CONEXÃO ==========
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

async function checkServerStatus() {
    try {
        const res = await fetchWithTimeout(`${API_URL}/licitacoes?limit=1`, {
            method: 'GET',
            headers: getHeaders()
        });
        if (res.status === 401) {
            consecutive401Count++;
            if (consecutive401Count >= MAX_401_BEFORE_LOGOUT) {
                sessionStorage.removeItem('licitacoesSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
            return;
        }
        consecutive401Count = 0;
        const wasOffline = !isOnline;
        isOnline = res.ok;
        if (wasOffline && isOnline) loadLicitacoes();
        updateConnectionStatus();
    } catch {
        isOnline = false;
        updateConnectionStatus();
    }
}

function updateConnectionStatus() {
    const el = document.getElementById('connectionStatus');
    if (el) el.className = isOnline ? 'connection-status online' : 'connection-status offline';
}

// ========== NAVEGAÇÃO DE MÊS ==========
function updateMonthDisplay() {
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const monthName = months[currentMonth.getMonth()];
    const year = currentMonth.getFullYear();
    document.getElementById('currentMonth').textContent = `${monthName} ${year}`;
}

function changeMonth(direction) {
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    updateMonthDisplay();
    loadLicitacoes();
}

// ========== CARREGAR LICITAÇÕES ==========
async function loadLicitacoes() {
    if (!isOnline) return;
    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;

    let url = `${API_URL}/licitacoes?mes=${currentMonth.getMonth()+1}&ano=${currentMonth.getFullYear()}`;

    try {
        const res = await fetch(url, { method: 'GET', headers: getHeaders(), signal });
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        if (!res.ok) return;
        licitacoes = await res.json();
        updateDisplay();
        verificarPrazosVencidos();
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Erro ao carregar licitações:', err);
    } finally {
        currentFetchController = null;
    }
}

function updateDisplay() {
    updateStats();
    filterLicitacoes();
}

function updateStats() {
    const total = licitacoes.length;
    const enviadas = licitacoes.filter(l => l.status === 'ENVIADA').length;
    const abertas = licitacoes.filter(l => l.status === 'ABERTA').length;
    const hoje = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje).length;
    document.getElementById('totalLicitacoes').textContent = total;
    document.getElementById('totalEnviadas').textContent = enviadas;
    document.getElementById('totalAbertas').textContent = abertas;
    document.getElementById('totalVencidas').textContent = vencidas;
    
    const card = document.getElementById('prazoVencidoCard');
    if (vencidas > 0) {
        card.classList.add('has-alert');
        let badge = card.querySelector('.pulse-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pulse-badge';
            badge.textContent = vencidas;
            card.appendChild(badge);
        } else {
            badge.textContent = vencidas;
        }
    } else {
        card.classList.remove('has-alert');
        const badge = card.querySelector('.pulse-badge');
        if (badge) badge.remove();
    }
}

function filterLicitacoes() {
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const filtered = licitacoes.filter(l => {
        const matchSearch = l.numero_proposta.toLowerCase().includes(search) || (l.uf && l.uf.toLowerCase().includes(search));
        const matchStatus = !statusFilter || l.status === statusFilter;
        return matchSearch && matchStatus;
    });
    renderLicitacoes(filtered);
}

function formatDateToBR(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function renderLicitacoes(lista) {
    const tbody = document.getElementById('licitacoesContainer');
    if (!tbody) return;
    if (!lista.length) {
        tbody.innerHTML = '.<td colspan="7" style="text-align:center;padding:2rem;">Nenhuma proposta encontrada</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(l => `
        <tr>
            <td style="text-align:center;" onclick="event.stopPropagation()">
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="check-${l.id}" class="styled-checkbox" ${l.status === 'ENVIADA' ? 'checked' : ''} onchange="toggleStatus('${l.id}')">
                    <label for="check-${l.id}" class="checkbox-label-styled"></label>
                </div>
            </td>
            <td onclick="viewLicitacao('${l.id}')"><strong>${l.numero_proposta}</strong></td>
            <td onclick="viewLicitacao('${l.id}')">${formatDateToBR(l.data)}</td>
            <td onclick="viewLicitacao('${l.id}')">${l.hora || '-'}</td>
            <td onclick="viewLicitacao('${l.id}')">${l.uf || '-'}</td>
            <td onclick="viewLicitacao('${l.id}')">
                <span class="status-badge ${l.status === 'ENVIADA' ? 'success' : 'warning'}">${l.status}</span>
            </td>
            <td class="actions-cell" onclick="event.stopPropagation()">
                <button class="action-btn edit" onclick="editLicitacao('${l.id}')">Editar</button>
                <button class="action-btn delete" onclick="openDeleteModal('${l.id}')">Excluir</button>
            </td>
        </tr>
    `).join('');
}

async function toggleStatus(id) {
    const proposta = licitacoes.find(l => l.id === id);
    if (!proposta) return;
    const novoStatus = proposta.status === 'ENVIADA' ? 'ABERTA' : 'ENVIADA';
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        const checkbox = document.getElementById(`check-${id}`);
        if (checkbox) checkbox.checked = (proposta.status === 'ENVIADA');
        return;
    }
    try {
        let res = await fetch(`${API_URL}/licitacoes/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ status: novoStatus })
        });
        if (res.status === 404) {
            const propostaAtualizada = { ...proposta, status: novoStatus };
            res = await fetch(`${API_URL}/licitacoes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getHeaders() },
                body: JSON.stringify(propostaAtualizada)
            });
        }
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado('Sessão expirada');
            return;
        }
        if (!res.ok) throw new Error('Erro ao atualizar status');
        const updated = await res.json();
        const index = licitacoes.findIndex(l => l.id === updated.id);
        if (index !== -1) licitacoes[index] = updated;
        updateDisplay();
        showToast(`Proposta ${novoStatus === 'ENVIADA' ? 'enviada' : 'reaberta'} com sucesso!`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
        const checkbox = document.getElementById(`check-${id}`);
        if (checkbox) checkbox.checked = (proposta.status === 'ENVIADA');
    }
}

// ========== CRUD LICITAÇÕES ==========
function openFormModal(editId = null) {
    editingId = editId;
    document.getElementById('formTitle').textContent = editId ? 'Editar Proposta' : 'Nova Proposta';
    if (editId) {
        const l = licitacoes.find(l => l.id === editId);
        document.getElementById('numeroProposta').value = l.numero_proposta;
        document.getElementById('dataProposta').value = l.data;
        document.getElementById('horaProposta').value = l.hora || '';
        document.getElementById('ufProposta').value = l.uf || '';
    } else {
        document.getElementById('numeroProposta').value = '';
        document.getElementById('dataProposta').value = new Date().toISOString().split('T')[0];
        document.getElementById('horaProposta').value = '';
        document.getElementById('ufProposta').value = '';
    }
    document.getElementById('formModal').classList.add('show');
}

function closeFormModal(showCancel = true) {
    document.getElementById('formModal').classList.remove('show');
    if (showCancel) showToast('Operação cancelada', 'error');
}

async function salvarLicitacao() {
    const data = {
        numero_proposta: document.getElementById('numeroProposta').value.trim(),
        data: document.getElementById('dataProposta').value,
        hora: document.getElementById('horaProposta').value || null,
        uf: document.getElementById('ufProposta').value || null,
        status: 'ABERTA'
    };
    if (!data.numero_proposta || !data.data) {
        showToast('Número e data são obrigatórios', 'error');
        return;
    }
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        closeFormModal(false);
        return;
    }
    try {
        const url = editingId ? `${API_URL}/licitacoes/${editingId}` : `${API_URL}/licitacoes`;
        const method = editingId ? 'PUT' : 'POST';
        const res = await fetchWithTimeout(url, {
            method, headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify(data)
        }, 15000);
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado('Sessão expirada');
            return;
        }
        if (!res.ok) throw new Error((await res.json()).error || 'Erro');
        const saved = await res.json();
        if (!editingId) licitacoes.push(saved);
        else licitacoes = licitacoes.map(l => l.id === saved.id ? saved : l);
        closeFormModal(false);
        showToast(editingId ? 'Proposta atualizada' : 'Proposta criada', 'success');
        updateDisplay();
        loadLicitacoes();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function editLicitacao(id) { openFormModal(id); }

function openDeleteModal(id) {
    currentLicitacaoId = id;
    document.getElementById('deleteModal').classList.add('show');
}
function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    currentLicitacaoId = null;
}
async function confirmarExclusao() {
    if (!currentLicitacaoId) return closeDeleteModal();
    if (!isOnline) { showToast('Sistema offline', 'error'); return closeDeleteModal(); }
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}`, {
            method: 'DELETE', headers: getHeaders()
        });
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado('Sessão expirada');
            return;
        }
        if (!res.ok) throw new Error('Erro ao excluir');
        licitacoes = licitacoes.filter(l => l.id !== currentLicitacaoId);
        showToast('Proposta excluída', 'error');
        closeDeleteModal();
        updateDisplay();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ========== MODAL PRAZO VENCIDO ==========
function abrirModalVencidos() {
    const hoje = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje);
    vencidosPage = 1;
    renderVencidosModal(vencidas);
    document.getElementById('modalVencidos').classList.add('show');
}

function renderVencidosModal(vencidas) {
    const start = (vencidosPage - 1) * VENCIDOS_PAGE_SIZE;
    const end = start + VENCIDOS_PAGE_SIZE;
    const pageData = vencidas.slice(start, end);
    const totalPages = Math.ceil(vencidas.length / VENCIDOS_PAGE_SIZE);
    
    const tbody = document.getElementById('vencidosTableBody');
    if (!tbody) return;
    
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma proposta com vencimento hoje</td></tr>';
    } else {
        tbody.innerHTML = pageData.map(l => `
            <tr onclick="viewLicitacao('${l.id}'); fecharModalVencidos();">
                <td>${l.numero_proposta}</td>
                <td>${formatDateToBR(l.data)}</td>
                <td>${l.hora || '-'}</td>
            </tr>
        `).join('');
    }
    
    const pagContainer = document.getElementById('vencidosPaginacao');
    if (pagContainer && totalPages > 1) {
        let pagHtml = '<div class="paginacao-btns">';
        pagHtml += `<button class="pag-btn" onclick="vencidosPageChange(${vencidosPage - 1})" ${vencidosPage === 1 ? 'disabled' : ''}>‹</button>`;
        for (let i = 1; i <= totalPages; i++) {
            pagHtml += `<button class="pag-btn ${i === vencidosPage ? 'pag-btn-active' : ''}" onclick="vencidosPageChange(${i})">${i}</button>`;
        }
        pagHtml += `<button class="pag-btn" onclick="vencidosPageChange(${vencidosPage + 1})" ${vencidosPage === totalPages ? 'disabled' : ''}>›</button>`;
        pagHtml += '</div>';
        pagContainer.innerHTML = pagHtml;
    } else if (pagContainer) {
        pagContainer.innerHTML = '';
    }
}

function vencidosPageChange(page) {
    const hoje = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje);
    if (page >= 1 && page <= Math.ceil(vencidas.length / VENCIDOS_PAGE_SIZE)) {
        vencidosPage = page;
        renderVencidosModal(vencidas);
    }
}

function fecharModalVencidos() {
    document.getElementById('modalVencidos').classList.remove('show');
}

function verificarPrazosVencidos() {
    updateStats();
}

// ========== TELA DE ITENS ==========
function viewLicitacao(id) {
    currentLicitacaoId = id;
    mostrarTelaItens();
    carregarItens(id);
}

function voltar() {
    document.getElementById('telaItens').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    currentLicitacaoId = null;
    itens = [];
}

function mostrarTelaItens() {
    document.querySelector('.container').style.display = 'none';
    let tela = document.getElementById('telaItens');
    if (!tela) {
        tela = document.createElement('div');
        tela.id = 'telaItens';
        tela.className = 'container';
        document.body.querySelector('.app-content').appendChild(tela);
    }

    const proposta = licitacoes.find(l => l.id === currentLicitacaoId);
    const tituloProposta = proposta ? `Proposta Nº ${proposta.numero_proposta}` : '';

    tela.innerHTML = `
        <!-- HEADER IGUAL AO PRINCIPAL -->
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Itens da Proposta</h1>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px;">${tituloProposta}</p>
                </div>
            </div>
            <!-- Botão vazio para manter estrutura (não há botão de nova proposta aqui) -->
            <div></div>
        </div>

        <!-- SEARCH BAR COM ÍCONES À DIREITA (igual à principal) -->
        <div class="search-bar-wrapper">
            <div class="search-bar">
                <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" id="search
