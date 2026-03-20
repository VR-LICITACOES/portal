// CONFIGURAÇÃO
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:10000/api'
    : `${window.location.origin}/api`;

let licitacoes = [];
let itens = [];
let currentLicitacaoId = null;
let editingId = null;
let editingItemIndex = null;
let isOnline = false;
let sessionToken = null;
let consecutive401Count = 0;
const MAX_401_BEFORE_LOGOUT = 3;
let currentMonth = new Date();
let isAllMonths = false;
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
    setInterval(() => {
        if (isOnline) loadLicitacoes();
    }, 30000);
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
    
    // Adiciona badge de alerta se houver vencidas
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

function renderLicitacoes(lista) {
    const tbody = document.getElementById('licitacoesContainer');
    if (!tbody) return;
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Nenhuma proposta encontrada</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(l => `
        <tr onclick="viewLicitacao('${l.id}')">
            <td><strong>${l.numero_proposta}</strong></td>
            <td>${new Date(l.data).toLocaleDateString('pt-BR')}</td>
            <td>${l.hora || '-'}</td>
            <td>${l.uf || '-'}</td>
            <td><span class="status-badge ${l.status === 'ENVIADA' ? 'success' : 'warning'}">${l.status}</span></td>
            <td class="actions-cell" onclick="event.stopPropagation()">
                <button class="action-btn edit" onclick="editLicitacao('${l.id}')">Editar</button>
                <button class="action-btn delete" onclick="openDeleteModal('${l.id}')">Excluir</button>
            </td>
        </tr>
    `).join('');
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
                <td>${new Date(l.data).toLocaleDateString('pt-BR')}</td>
                <td>${l.hora || '-'}</td>
            </tr>
        `).join('');
    }
    
    // Paginação
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

// ========== VERIFICAR PRAZOS VENCIDOS ==========
function verificarPrazosVencidos() {
    const hoje = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje);
    updateStats(); // atualiza o badge
}

// ========== VISUALIZAR PROPOSTA (abre tela de itens) ==========
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

// ========== TELA DE ITENS (criada dinamicamente) ==========
function mostrarTelaItens() {
    document.querySelector('.container').style.display = 'none';
    let tela = document.getElementById('telaItens');
    if (!tela) {
        tela = document.createElement('div');
        tela.id = 'telaItens';
        tela.className = 'container';
        tela.innerHTML = `
            <div class="header">
                <div class="header-left">
                    <div>
                        <h1>Itens da Proposta</h1>
                        <p id="tituloItens" style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px;"></p>
                    </div>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items:center;">
                    <button onclick="adicionarItem()" class="btn-add-item">+ Item</button>
                    <button onclick="abrirModalIntervalo()" class="btn-add-interval">+ Intervalo</button>
                    <button onclick="abrirModalExcluirItens()" class="btn-delete-selected">Excluir</button>
                    <button onclick="abrirModalCotacao()" class="btn-cotacao" title="Cotação">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </button>
                    <button onclick="syncItens()" class="btn-sync" title="Sincronizar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                    <button onclick="voltar()" class="btn-back" title="Voltar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    </button>
                </div>
            </div>
            <div class="search-bar-wrapper">
                <div class="search-bar">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input type="text" id="searchItens" placeholder="Pesquisar itens" oninput="filterItens()">
                    <div class="search-bar-filters">
                        <div class="filter-dropdown-inline">
                            <select id="filterMarcaItens" onchange="filterItens()">
                                <option value="">Marca</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card table-card">
                <div style="overflow-x: auto;">
                    <table style="min-width: 1200px;">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;">✓</th>
                                <th style="width: 60px;">ITEM</th>
                                <th style="min-width: 300px;">DESCRIÇÃO</th>
                                <th style="width: 80px;">QTD</th>
                                <th style="width: 80px;">UND</th>
                                <th style="width: 120px;">MARCA</th>
                                <th style="width: 120px;">MODELO</th>
                                <th style="width: 120px;">CUSTO UNT</th>
                                <th style="width: 120px;">CUSTO TOTAL</th>
                                <th style="width: 120px;">VENDA UNT</th>
                                <th style="width: 120px;">VENDA TOTAL</th>
                            </tr>
                        </thead>
                        <tbody id="itensContainer"></tbody>
                    </table>
                </div>
            </div>
            <div id="itensTotaisBar" style="display:flex;gap:2rem;padding:1rem;font-size:10pt;"></div>
        `;
        document.body.querySelector('.app-content').appendChild(tela);
    }
    tela.style.display = 'block';
    const lic = licitacoes.find(l => l.id === currentLicitacaoId);
    if (lic) {
        const titulo = document.getElementById('tituloItens');
        if (titulo) titulo.textContent = `Proposta Nº ${lic.numero_proposta}`;
    }
}

// ========== ITENS CRUD (mantido do código anterior) ==========
// ... (manter todas as funções de itens do script.js anterior)
// As funções de itens (carregarItens, renderItens, adicionarItem, editarItem, etc.) são as mesmas já fornecidas

// ========== UTILITÁRIOS ==========
function showToast(msg, tipo = 'success') {
    document.querySelectorAll('.floating-message').forEach(m => m.remove());
    const d = document.createElement('div');
    d.className = `floating-message ${tipo}`;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => {
        d.style.animation = 'slideOutBottom 0.3s ease forwards';
        setTimeout(() => d.remove(), 300);
    }, 3000);
}

// ========== EXPOSIÇÃO GLOBAL ==========
window.openFormModal = openFormModal;
window.closeFormModal = closeFormModal;
window.salvarLicitacao = salvarLicitacao;
window.editLicitacao = editLicitacao;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmarExclusao = confirmarExclusao;
window.filterLicitacoes = filterLicitacoes;
window.syncData = loadLicitacoes;
window.changeMonth = changeMonth;
window.toggleCalendar = toggleCalendar;
window.viewLicitacao = viewLicitacao;
window.voltar = voltar;
window.abrirModalVencidos = abrirModalVencidos;
window.fecharModalVencidos = fecharModalVencidos;
window.vencidosPageChange = vencidosPageChange;
