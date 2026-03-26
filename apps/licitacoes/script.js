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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Nenhuma proposta encontrada</td></tr>';
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

    // Obtém a proposta atual
    const proposta = licitacoes.find(l => l.id === currentLicitacaoId);
    const tituloProposta = proposta ? `Proposta Nº ${proposta.numero_proposta}` : '';

    tela.innerHTML = `
        <!-- HEADER IDÊNTICO AO PRINCIPAL -->
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Itens da Proposta</h1>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px;">${tituloProposta}</p>
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items: center;">
                <button onclick="adicionarItem()" class="btn-icon" title="Adicionar item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                <button onclick="abrirModalCotacao()" class="btn-icon" title="Email">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                    </svg>
                </button>
                <button onclick="syncItens()" class="btn-icon" title="Sincronizar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
                <button onclick="voltar()" class="btn-icon" title="Voltar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>

        <!-- SEARCH BAR (igual à principal) -->
        <div class="search-bar-wrapper">
            <div class="search-bar">
                <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" id="searchItens" placeholder="Pesquisar itens" oninput="filterItens()">
            </div>
        </div>

        <!-- TABELA DE ITENS (mesmo estilo da principal) -->
        <div class="card table-card">
            <div style="overflow-x: auto;">
                <table style="min-width: 1000px;">
                    <thead>
                        <tr>
                            <th>ITEM</th>
                            <th style="min-width: 250px;">DESCRIÇÃO</th>
                            <th>QTD</th>
                            <th>UND</th>
                            <th>MARCA</th>
                            <th>MODELO</th>
                            <th>CUSTO UNT</th>
                            <th>CUSTO TOTAL</th>
                            <th>VENDA UNT</th>
                            <th>VENDA TOTAL</th>
                        </tr>
                    </thead>
                    <tbody id="itensContainer"></tbody>
                </table>
            </div>
        </div>

        <!-- TOTAIS (barra sem emojis) -->
        <div class="totals-bar">
            <span><strong>CUSTO TOTAL:</strong> <span id="totalCusto">R$ 0,00</span></span>
            <span><strong>VENDA TOTAL:</strong> <span id="totalVenda">R$ 0,00</span></span>
            <span><strong>MARGEM:</strong> <span id="totalMargem">0%</span></span>
        </div>
    `;

    // Adiciona o checkbox de "Proposta Enviada" ao lado dos botões
    const headerRight = tela.querySelector('.header > div:last-child');
    if (headerRight && !headerRight.querySelector('.checkbox-wrapper')) {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'checkbox-wrapper';
        checkboxDiv.style.marginLeft = 'auto';
        checkboxDiv.innerHTML = `
            <input type="checkbox" id="check-enviada" class="styled-checkbox" onchange="toggleEnviarProposta()">
            <label for="check-enviada" class="checkbox-label-styled"></label>
            <span style="font-size: 0.9rem; margin-left: 8px;">Proposta Enviada</span>
        `;
        headerRight.appendChild(checkboxDiv);
    }

    tela.style.display = 'block';
    const lic = licitacoes.find(l => l.id === currentLicitacaoId);
    if (lic) {
        const checkbox = document.getElementById('check-enviada');
        if (checkbox) checkbox.checked = (lic.status === 'ENVIADA');
    }
}

async function toggleEnviarProposta() {
    const proposta = licitacoes.find(l => l.id === currentLicitacaoId);
    if (!proposta) return;
    const novoStatus = proposta.status === 'ENVIADA' ? 'ABERTA' : 'ENVIADA';
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        return;
    }
    try {
        let res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ status: novoStatus })
        });
        if (res.status === 404) {
            const propostaAtualizada = { ...proposta, status: novoStatus };
            res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}`, {
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
        const checkbox = document.getElementById('check-enviada');
        if (checkbox) checkbox.checked = (novoStatus === 'ENVIADA');
        showToast(`Proposta ${novoStatus === 'ENVIADA' ? 'enviada' : 'reaberta'} com sucesso!`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ========== CRUD DE ITENS ==========
async function carregarItens(licitacaoId) {
    if (!isOnline) return;
    try {
        const res = await fetch(`${API_URL}/licitacoes/${licitacaoId}/itens`, {
            headers: getHeaders()
        });
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado('Sessão expirada');
            return;
        }
        if (!res.ok) throw new Error('Erro ao carregar itens');
        itens = await res.json();
        renderItens();
        atualizarTotais();
    } catch (err) {
        console.error(err);
        showToast('Erro ao carregar itens', 'error');
        const tbody = document.getElementById('itensContainer');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Erro ao carregar itens</td></tr>';
    }
}

function renderItens() {
    const tbody = document.getElementById('itensContainer');
    if (!tbody) return;
    const search = document.getElementById('searchItens')?.value.toLowerCase() || '';
    const filtered = itens.filter(item => {
        return item.descricao.toLowerCase().includes(search) || (item.modelo && item.modelo.toLowerCase().includes(search));
    });
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum item cadastrado</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map((item, idx) => `
        <tr onclick="abrirEdicaoItem(${item.id || idx})" style="cursor:pointer;">
            <td>${item.numero_item || idx+1}</td>
            <td class="descricao-cell">${item.descricao || ''}</td>
            <td>${item.quantidade || 0}</td>
            <td>${item.unidade || ''}</td>
            <td>${item.marca || ''}</td>
            <td>${item.modelo || ''}</td>
            <td>${formatMoney(item.custo_unitario)}</td>
            <td>${formatMoney(item.custo_total)}</td>
            <td>${formatMoney(item.venda_unitario)}</td>
            <td>${formatMoney(item.venda_total)}</td>
        </tr>
    `).join('');
}

function atualizarTotais() {
    const totalCusto = itens.reduce((acc, i) => acc + (i.custo_total || 0), 0);
    const totalVenda = itens.reduce((acc, i) => acc + (i.venda_total || 0), 0);
    const margem = totalCusto ? ((totalVenda - totalCusto) / totalCusto * 100).toFixed(2) : 0;
    
    const totalCustoSpan = document.getElementById('totalCusto');
    const totalVendaSpan = document.getElementById('totalVenda');
    const totalMargemSpan = document.getElementById('totalMargem');
    if (totalCustoSpan) totalCustoSpan.textContent = formatMoney(totalCusto);
    if (totalVendaSpan) totalVendaSpan.textContent = formatMoney(totalVenda);
    if (totalMargemSpan) totalMargemSpan.textContent = `${margem}%`;
}

function formatMoney(value) {
    if (value === undefined || value === null) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function adicionarItem() {
    editingItemId = null;
    document.getElementById('itemModalTitle').textContent = 'Adicionar Item';
    document.getElementById('itemNumero').value = itens.length + 1;
    document.getElementById('itemDescricao').value = '';
    document.getElementById('itemQuantidade').value = '';
    document.getElementById('itemUnidade').value = 'UN';
    document.getElementById('itemMarca').value = '';
    document.getElementById('itemModelo').value = '';
    document.getElementById('itemPrazoEntrega').value = '';
    document.getElementById('itemFrete').value = '';
    document.getElementById('itemCustoUnitario').value = '';
    document.getElementById('itemVendaUnitario').value = '';
    recalcularItemTotais();
    document.getElementById('itemModal').classList.add('show');
}

function abrirEdicaoItem(index) {
    const item = itens[index];
    if (!item) return;
    editingItemId = item.id || index;
    document.getElementById('itemModalTitle').textContent = 'Editar Item';
    document.getElementById('itemNumero').value = item.numero_item;
    document.getElementById('itemDescricao').value = item.descricao;
    document.getElementById('itemQuantidade').value = item.quantidade;
    document.getElementById('itemUnidade').value = item.unidade || 'UN';
    document.getElementById('itemMarca').value = item.marca || '';
    document.getElementById('itemModelo').value = item.modelo || '';
    document.getElementById('itemPrazoEntrega').value = item.prazo_entrega || '';
    document.getElementById('itemFrete').value = item.frete || '';
    document.getElementById('itemCustoUnitario').value = item.custo_unitario || '';
    document.getElementById('itemVendaUnitario').value = item.venda_unitario || '';
    recalcularItemTotais();
    document.getElementById('itemModal').classList.add('show');
}

function fecharItemModal() {
    document.getElementById('itemModal').classList.remove('show');
    editingItemId = null;
}

function recalcularItemTotais() {
    const qtd = parseFloat(document.getElementById('itemQuantidade').value) || 0;
    const custoUnit = parseFloat(document.getElementById('itemCustoUnitario').value) || 0;
    const vendaUnit = parseFloat(document.getElementById('itemVendaUnitario').value) || 0;
    const custoTotal = qtd * custoUnit;
    const vendaTotal = qtd * vendaUnit;
    const lucroBruto = vendaTotal - custoTotal;
    document.getElementById('itemCustoTotal').value = formatMoney(custoTotal);
    document.getElementById('itemVendaTotal').value = formatMoney(vendaTotal);
    document.getElementById('itemLucroBruto').value = formatMoney(lucroBruto);
}

async function salvarItem() {
    const itemData = {
        numero_item: parseInt(document.getElementById('itemNumero').value),
        descricao: document.getElementById('itemDescricao').value.trim(),
        quantidade: parseFloat(document.getElementById('itemQuantidade').value),
        unidade: document.getElementById('itemUnidade').value.trim(),
        marca: document.getElementById('itemMarca').value.trim(),
        modelo: document.getElementById('itemModelo').value.trim(),
        custo_unitario: parseFloat(document.getElementById('itemCustoUnitario').value) || 0,
        venda_unitario: parseFloat(document.getElementById('itemVendaUnitario').value) || 0,
        prazo_entrega: document.getElementById('itemPrazoEntrega').value.trim(),
        frete: parseFloat(document.getElementById('itemFrete').value) || 0
    };
    if (!itemData.descricao || isNaN(itemData.quantidade) || itemData.quantidade <= 0) {
        showToast('Descrição e quantidade são obrigatórios', 'error');
        return;
    }
    itemData.custo_total = itemData.custo_unitario * itemData.quantidade;
    itemData.venda_total = itemData.venda_unitario * itemData.quantidade;
    itemData.lucro_bruto = itemData.venda_total - itemData.custo_total;
    
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        return;
    }
    try {
        let url, method;
        if (editingItemId !== null && typeof editingItemId === 'number' && itens[editingItemId] && itens[editingItemId].id) {
            url = `${API_URL}/licitacoes/${currentLicitacaoId}/itens/${itens[editingItemId].id}`;
            method = 'PUT';
        } else {
            url = `${API_URL}/licitacoes/${currentLicitacaoId}/itens`;
            method = 'POST';
        }
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify(itemData)
        });
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado('Sessão expirada');
            return;
        }
        if (!res.ok) throw new Error('Erro ao salvar item');
        const saved = await res.json();
        if (method === 'POST') {
            itens.push(saved);
        } else {
            const index = itens.findIndex(i => i.id === saved.id);
            if (index !== -1) itens[index] = saved;
        }
        fecharItemModal();
        renderItens();
        atualizarTotais();
        showToast('Item salvo com sucesso', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function filterItens() {
    renderItens();
}

function syncItens() {
    if (currentLicitacaoId) carregarItens(currentLicitacaoId);
}

function abrirModalCotacao() {
    showToast('Funcionalidade em desenvolvimento', 'error');
}

function fecharModalCotacao() {
    document.getElementById('modalCotacao').classList.remove('show');
}

function copiarMensagemCotacao() {
    const msg = document.getElementById('cotacaoMensagem').value;
    navigator.clipboard.writeText(msg);
    showToast('Mensagem copiada!', 'success');
}

function gerarMensagemCotacao() {
    // Placeholder
}

function switchItemTab(tabId) {
    document.querySelectorAll('#itemModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#itemModal .tab-content').forEach(content => content.classList.remove('active'));
    const activeBtn = document.querySelector(`#itemModal .tab-btn[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

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

function syncData() {
    loadLicitacoes();
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
window.syncData = syncData;
window.changeMonth = changeMonth;
window.toggleCalendar = toggleCalendar;
window.viewLicitacao = viewLicitacao;
window.voltar = voltar;
window.abrirModalVencidos = abrirModalVencidos;
window.fecharModalVencidos = fecharModalVencidos;
window.vencidosPageChange = vencidosPageChange;
window.adicionarItem = adicionarItem;
window.salvarItem = salvarItem;
window.fecharItemModal = fecharItemModal;
window.filterItens = filterItens;
window.syncItens = syncItens;
window.abrirModalCotacao = abrirModalCotacao;
window.fecharModalCotacao = fecharModalCotacao;
window.copiarMensagemCotacao = copiarMensagemCotacao;
window.gerarMensagemCotacao = gerarMensagemCotacao;
window.switchItemTab = switchItemTab;
window.toggleStatus = toggleStatus;
window.toggleEnviarProposta = toggleEnviarProposta;
window.recalcularItemTotais = recalcularItemTotais;
