// ========== CONFIGURAÇÃO ==========
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:10000/api'
    : `${window.location.origin}/api`;

let licitacoes       = [];
let itens            = [];
let currentLicitacaoId = null;
let editingId        = null;
let editingItemId    = null;
let isOnline         = false;
let sessionToken     = null;
let consecutive401Count = 0;
const MAX_401_BEFORE_LOGOUT = 3;
let currentMonth     = new Date();
let currentFetchController = null;
let vencidosPage     = 1;
const VENCIDOS_PAGE_SIZE = 3;
let currentDateFilter = null;

// IDs dos itens que já foram enviados para cotação nesta sessão
let itensCotados = new Set();

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
    const urlParams  = new URLSearchParams(window.location.search);
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
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    height:100vh;background:var(--bg-app);color:var(--text-primary);text-align:center;padding:2rem;">
            <h1 style="font-size:2rem;margin-bottom:1rem;font-weight:700;">NÃO AUTORIZADO</h1>
            <p style="color:var(--text-secondary);margin-bottom:2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="/" style="display:inline-block;background:var(--btn-register);color:white;
               padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Ir para o Portal</a>
        </div>`;
}

function inicializarApp() { loadLicitacoes(); }

// ========== CONEXÃO ==========
function getHeaders() {
    const h = { Accept: 'application/json' };
    if (sessionToken) h['X-Session-Token'] = sessionToken;
    return h;
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal, mode: 'cors' });
        clearTimeout(tid);
        return res;
    } catch (err) { clearTimeout(tid); throw err; }
}

async function checkServerStatus() {
    try {
        const res = await fetchWithTimeout(`${API_URL}/licitacoes?limit=1`, { method: 'GET', headers: getHeaders() });
        if (res.status === 401) {
            consecutive401Count++;
            if (consecutive401Count >= MAX_401_BEFORE_LOGOUT) {
                sessionStorage.removeItem('licitacoesSession');
                mostrarTelaAcessoNegado();
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
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const el = document.getElementById('currentMonth');
    if (el) el.textContent = `${months[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
}

function changeMonth(direction) {
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    updateMonthDisplay();
    currentDateFilter = null;
    loadLicitacoes();
}

// ========== CARREGAR LICITAÇÕES ==========
async function loadLicitacoes() {
    if (!isOnline) return;
    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;
    const url = `${API_URL}/licitacoes?mes=${currentMonth.getMonth()+1}&ano=${currentMonth.getFullYear()}`;
    try {
        const res = await fetch(url, { method: 'GET', headers: getHeaders(), signal });
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) return;
        licitacoes = await res.json();
        updateDisplay();
        verificarPrazosVencidos();
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Erro ao carregar licitações:', err);
    } finally { currentFetchController = null; }
}

function updateDisplay() { updateStats(); filterLicitacoes(); }

function updateStats() {
    const total    = licitacoes.length;
    const enviadas = licitacoes.filter(l => l.status === 'ENVIADA').length;
    const abertas  = licitacoes.filter(l => l.status === 'ABERTA').length;
    const hoje     = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje).length;

    document.getElementById('totalLicitacoes').textContent = total;
    document.getElementById('totalEnviadas').textContent   = enviadas;
    document.getElementById('totalAbertas').textContent    = abertas;
    document.getElementById('totalVencidas').textContent   = vencidas;

    const card = document.getElementById('prazoVencidoCard');
    if (vencidas > 0) {
        card.classList.add('has-alert');
        let badge = card.querySelector('.pulse-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pulse-badge';
            card.appendChild(badge);
        }
        badge.textContent = vencidas;
    } else {
        card.classList.remove('has-alert');
        const badge = card.querySelector('.pulse-badge');
        if (badge) badge.remove();
    }
}

function filterLicitacoes() {
    const search       = (document.getElementById('search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    let filtered = licitacoes.filter(l => {
        const matchSearch = l.numero_proposta.toLowerCase().includes(search) ||
                            (l.uf && l.uf.toLowerCase().includes(search));
        const matchStatus = !statusFilter || l.status === statusFilter;
        return matchSearch && matchStatus;
    });
    if (currentDateFilter) filtered = filtered.filter(l => l.data === currentDateFilter);
    renderLicitacoes(filtered);
}

function formatDateToBR(dateStr) {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function renderLicitacoes(lista) {
    const tbody = document.getElementById('licitacoesContainer');
    if (!tbody) return;
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted);">Nenhuma proposta encontrada</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(l => {
        const isEnviada = l.status === 'ENVIADA';
        return `
        <tr class="${isEnviada ? 'row-enviada' : ''}">
            <td style="text-align:center; width:46px;" onclick="event.stopPropagation()">
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="check-${l.id}" class="styled-checkbox" ${isEnviada ? 'checked' : ''} onchange="toggleStatus('${l.id}')">
                    <label for="check-${l.id}" class="checkbox-label-styled"></label>
                </div>
            </td>
            <td onclick="viewLicitacao('${l.id}')"><strong style="font-weight:600;">${l.numero_proposta}</strong></td>
            <td onclick="viewLicitacao('${l.id}')">${formatDateToBR(l.data)}</td>
            <td onclick="viewLicitacao('${l.id}')">${l.hora || '—'}</td>
            <td onclick="viewLicitacao('${l.id}')">${l.uf || '—'}</td>
            <td class="col-status" style="text-align:center;" onclick="viewLicitacao('${l.id}')">
                <span class="status-badge ${isEnviada ? 'success' : 'warning'}">${l.status}</span>
            </td>
            <td class="actions-cell" onclick="event.stopPropagation()">
                <button class="action-btn edit"   onclick="editLicitacao('${l.id}')">Editar</button>
                <button class="action-btn delete" onclick="openDeleteModal('${l.id}')">Excluir</button>
            </td>
        </tr>`;
    }).join('');
}

async function toggleStatus(id) {
    const proposta = licitacoes.find(l => l.id === id);
    if (!proposta) return;
    const novoStatus = proposta.status === 'ENVIADA' ? 'ABERTA' : 'ENVIADA';
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        const cb = document.getElementById(`check-${id}`);
        if (cb) cb.checked = proposta.status === 'ENVIADA';
        return;
    }
    try {
        let res = await fetch(`${API_URL}/licitacoes/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ status: novoStatus })
        });
        if (res.status === 404) {
            res = await fetch(`${API_URL}/licitacoes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getHeaders() },
                body: JSON.stringify({ ...proposta, status: novoStatus })
            });
        }
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao atualizar status');
        const updated = await res.json();
        const idx = licitacoes.findIndex(l => l.id === updated.id);
        if (idx !== -1) licitacoes[idx] = updated;
        updateDisplay();
        showToast(`Proposta ${novoStatus === 'ENVIADA' ? 'marcada como enviada' : 'reaberta'}`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
        const cb = document.getElementById(`check-${id}`);
        if (cb) cb.checked = proposta.status === 'ENVIADA';
    }
}

// ========== CRUD LICITAÇÕES ==========
function openFormModal(editId = null) {
    editingId = editId;
    document.getElementById('formTitle').textContent = editId ? 'Editar Proposta' : 'Nova Proposta';
    if (editId) {
        const l = licitacoes.find(l => l.id === editId);
        document.getElementById('numeroProposta').value = l.numero_proposta;
        document.getElementById('dataProposta').value   = l.data;
        document.getElementById('horaProposta').value   = l.hora || '';
        document.getElementById('ufProposta').value     = l.uf || '';
    } else {
        document.getElementById('numeroProposta').value = '';
        document.getElementById('dataProposta').value   = new Date().toISOString().split('T')[0];
        document.getElementById('horaProposta').value   = '';
        document.getElementById('ufProposta').value     = '';
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
        data:   document.getElementById('dataProposta').value,
        hora:   document.getElementById('horaProposta').value || null,
        uf:     document.getElementById('ufProposta').value || null,
        status: 'ABERTA'
    };
    if (!data.numero_proposta || !data.data) { showToast('Número e data são obrigatórios', 'error'); return; }
    if (!isOnline) { showToast('Sistema offline', 'error'); closeFormModal(false); return; }
    try {
        const url    = editingId ? `${API_URL}/licitacoes/${editingId}` : `${API_URL}/licitacoes`;
        const method = editingId ? 'PUT' : 'POST';
        const res = await fetchWithTimeout(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify(data)
        }, 15000);
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error((await res.json()).error || 'Erro');
        const saved = await res.json();
        if (!editingId) licitacoes.push(saved);
        else licitacoes = licitacoes.map(l => l.id === saved.id ? saved : l);
        closeFormModal(false);
        showToast(editingId ? 'Proposta atualizada' : 'Proposta criada', 'success');
        updateDisplay();
        loadLicitacoes();
    } catch (err) { showToast(err.message, 'error'); }
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
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}`, { method: 'DELETE', headers: getHeaders() });
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao excluir');
        licitacoes = licitacoes.filter(l => l.id !== currentLicitacaoId);
        showToast('Proposta excluída', 'error');
        closeDeleteModal();
        updateDisplay();
    } catch (err) { showToast(err.message, 'error'); }
}

// ========== MODAL PRAZO VENCIDO ==========
function abrirModalVencidos() {
    const hoje    = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje);
    vencidosPage  = 1;
    renderVencidosModal(vencidas);
    document.getElementById('modalVencidos').classList.add('show');
}
function renderVencidosModal(vencidas) {
    const start     = (vencidosPage - 1) * VENCIDOS_PAGE_SIZE;
    const pageData  = vencidas.slice(start, start + VENCIDOS_PAGE_SIZE);
    const totalPages= Math.ceil(vencidas.length / VENCIDOS_PAGE_SIZE);
    const tbody     = document.getElementById('vencidosTableBody');
    if (!tbody) return;
    tbody.innerHTML = pageData.length === 0
        ? '<tr><td colspan="3" style="text-align:center;padding:1.5rem;color:var(--text-muted);">Nenhuma proposta com vencimento hoje</td></tr>'
        : pageData.map(l => `<tr onclick="viewLicitacao('${l.id}'); fecharModalVencidos();">
            <td>${l.numero_proposta}</td><td>${formatDateToBR(l.data)}</td><td>${l.hora || '—'}</td>
          </tr>`).join('');
    const pag = document.getElementById('vencidosPaginacao');
    if (pag && totalPages > 1) {
        let h = '<div class="paginacao-btns">';
        h += `<button class="pag-btn" onclick="vencidosPageChange(${vencidosPage-1})" ${vencidosPage===1?'disabled':''}>‹</button>`;
        for (let i = 1; i <= totalPages; i++)
            h += `<button class="pag-btn ${i===vencidosPage?'pag-btn-active':''}" onclick="vencidosPageChange(${i})">${i}</button>`;
        h += `<button class="pag-btn" onclick="vencidosPageChange(${vencidosPage+1})" ${vencidosPage===totalPages?'disabled':''}>›</button></div>`;
        pag.innerHTML = h;
    } else if (pag) { pag.innerHTML = ''; }
}
function vencidosPageChange(page) {
    const hoje    = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje);
    if (page >= 1 && page <= Math.ceil(vencidas.length / VENCIDOS_PAGE_SIZE)) {
        vencidosPage = page; renderVencidosModal(vencidas);
    }
}
function fecharModalVencidos() { document.getElementById('modalVencidos').classList.remove('show'); }
function verificarPrazosVencidos() { updateStats(); }

// ========== SYNC PRINCIPAL ==========
function syncData() {
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    loadLicitacoes()
        .then(() => showToast('Dados sincronizados!', 'success'))
        .catch(() => showToast('Erro ao sincronizar', 'error'));
}

// ========== TELA DE ITENS ==========
function viewLicitacao(id) {
    currentLicitacaoId = id;
    itensCotados = new Set(); // reseta marcação ao entrar numa proposta
    mostrarTelaItens();
    carregarItens(id);
}

function voltar() {
    document.getElementById('telaItens').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    currentLicitacaoId = null;
    itens = [];
}

function mostrarTelaItens() {
    document.getElementById('mainContainer').style.display = 'none';
    let tela = document.getElementById('telaItens');
    if (!tela) {
        tela = document.createElement('div');
        tela.id = 'telaItens';
        document.body.querySelector('.app-content').appendChild(tela);
    }

    const proposta = licitacoes.find(l => l.id === currentLicitacaoId);
    const numProposta = proposta ? proposta.numero_proposta : '';

    tela.innerHTML = `
    <div class="container" id="containerItens">
        <!-- HEADER -->
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Itens da Proposta</h1>
                    <p class="proposta-subtitulo">Proposta Nº ${numProposta}</p>
                </div>
            </div>
            <div></div>
        </div>

        <!-- SEARCH BAR -->
        <div class="search-bar-wrapper">
            <div class="search-bar">
                <svg class="search-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input type="text" id="searchItens" placeholder="Pesquisar itens..." oninput="filterItens()">
                <div class="search-bar-filters" style="margin-left:auto;">
                    <button onclick="adicionarItem()" class="calendar-btn" title="Adicionar item">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button onclick="abrirModalCotacao()" class="calendar-btn" title="Enviar cotação">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </button>
                    <button onclick="syncItens()" class="calendar-btn" title="Sincronizar">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                    <button onclick="voltar()" class="calendar-btn" title="Voltar">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    </button>
                </div>
            </div>
        </div>

        <!-- TABELA DE ITENS -->
        <div class="card table-card">
            <div style="overflow-x:auto;">
                <table style="min-width:1050px;">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th style="min-width:220px;">Descrição</th>
                            <th>Qtd</th>
                            <th>Und</th>
                            <th>Marca</th>
                            <th>Modelo</th>
                            <th>Custo Unt</th>
                            <th>Custo Total</th>
                            <th>Venda Unt</th>
                            <th>Venda Total</th>
                            <th>Frete</th>
                            <th>Lucro Bruto</th>
                        </tr>
                    </thead>
                    <tbody id="itensContainer"></tbody>
                </table>
            </div>
        </div>

        <!-- BARRA DE TOTAIS -->
        <div class="totals-bar" id="totalsBar">
            <span><strong>Custo Total:</strong> <span id="totalCusto">R$ 0,00</span></span>
            <span><strong>Venda Total:</strong> <span id="totalVenda">R$ 0,00</span></span>
            <span><strong>Total Frete:</strong> <span id="totalFrete">R$ 0,00</span></span>
            <span><strong>Lucro B. Total:</strong> <span id="totalLucroBruto">R$ 0,00</span></span>
        </div>
    </div>

    <!-- ===== MODAL: ADICIONAR / EDITAR ITEM ===== -->
    <div class="modal-overlay" id="itemModal">
        <div class="modal-content" style="max-width:860px">
            <div class="modal-header">
                <h3 class="modal-title" id="itemModalTitle">Adicionar Item</h3>
                <button class="close-modal" onclick="fecharItemModal()">✕</button>
            </div>
            <div class="tabs-container">
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchItemTab('item-tab-geral')">Geral</button>
                    <button class="tab-btn" onclick="switchItemTab('item-tab-transporte')">Transporte</button>
                    <button class="tab-btn" onclick="switchItemTab('item-tab-valores')">Valores</button>
                </div>

                <div class="tab-content active" id="item-tab-geral">
                    <div class="form-grid">
                        <div class="form-group"><label>Nº Item</label><input type="number" id="itemNumero" readonly></div>
                        <div class="form-group"><label>Descrição *</label><input type="text" id="itemDescricao" required></div>
                        <div class="form-group"><label>Quantidade *</label><input type="number" step="any" id="itemQuantidade" required oninput="recalcularItemTotais()"></div>
                        <div class="form-group">
                            <label>Unidade</label>
                            <select id="itemUnidade">
                                <option value="UN">UN</option><option value="CX">CX</option>
                                <option value="MT">MT</option><option value="PCT">PCT</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Marca</label><input type="text" id="itemMarca"></div>
                        <div class="form-group"><label>Modelo</label><input type="text" id="itemModelo"></div>
                    </div>
                </div>

                <div class="tab-content" id="item-tab-transporte">
                    <div class="form-grid">
                        <div class="form-group"><label>Prazo de Entrega</label><input type="text" id="itemPrazoEntrega"></div>
                        <div class="form-group"><label>Frete (R$)</label><input type="number" step="any" id="itemFrete" oninput="recalcularItemTotais()"></div>
                    </div>
                </div>

                <div class="tab-content" id="item-tab-valores">
                    <div class="form-grid">
                        <div class="form-group"><label>Custo Unitário</label><input type="number" step="any" id="itemCustoUnitario" oninput="recalcularItemTotais()"></div>
                        <div class="form-group"><label>Custo Total</label><input type="text" id="itemCustoTotal" readonly></div>
                        <div class="form-group"><label>Venda Unitário</label><input type="number" step="any" id="itemVendaUnitario" oninput="recalcularItemTotais()"></div>
                        <div class="form-group"><label>Venda Total</label><input type="text" id="itemVendaTotal" readonly></div>
                        <div class="form-group"><label>Frete</label><input type="text" id="itemFreteDisplay" readonly></div>
                        <div class="form-group"><label>Lucro Bruto</label><input type="text" id="itemLucroBruto" readonly></div>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="success" onclick="salvarItem()">Salvar</button>
                <button class="danger"  onclick="fecharItemModal()">Cancelar</button>
            </div>
        </div>
    </div>

    <!-- ===== MODAL: COTAÇÃO ===== -->
    <div class="modal-overlay" id="modalCotacaoItens">
        <div class="modal-content" style="max-width:500px">
            <div class="modal-header">
                <h3 class="modal-title">Enviar Cotação</h3>
                <button class="close-modal" onclick="fecharModalCotacao()">✕</button>
            </div>

            <div class="form-group" style="margin-bottom:1.25rem;">
                <label>Fornecedor (Marca)</label>
                <div class="filter-dropdown-inline" style="min-width:unset; margin-top:4px;">
                    <select id="cotacaoFornecedorSelect">
                        <option value="">Selecione a marca...</option>
                    </select>
                    <svg class="dropdown-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
            </div>

            <div class="form-group" style="margin-bottom:1.5rem;">
                <label style="margin-bottom:8px;">Tipo de envio</label>
                <div class="cotacao-tipo-grid">
                    <div class="cotacao-tipo-card selected" id="tipoCardDescricao" onclick="selecionarTipoCotacao('descricao')">
                        <div class="tipo-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </div>
                        <span class="tipo-label">Descrição</span>
                    </div>
                    <div class="cotacao-tipo-card" id="tipoCardModelo" onclick="selecionarTipoCotacao('modelo')">
                        <div class="tipo-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        </div>
                        <span class="tipo-label">Modelo</span>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button class="success" onclick="enviarCotacao()" id="btnEnviarCotacao">
                    <span id="btnEnviarCotacaoLabel">Enviar</span>
                </button>
                <button class="danger" onclick="fecharModalCotacao()">Cancelar</button>
            </div>
        </div>
    </div>
    `;

    tela.style.display = 'block';
}

// Variável de estado do tipo de cotação selecionado
let cotacaoTipoAtual = 'descricao';

function selecionarTipoCotacao(tipo) {
    cotacaoTipoAtual = tipo;
    document.getElementById('tipoCardDescricao')?.classList.toggle('selected', tipo === 'descricao');
    document.getElementById('tipoCardModelo')?.classList.toggle('selected', tipo === 'modelo');
}

// ========== CRUD DE ITENS ==========
async function carregarItens(licitacaoId) {
    if (!isOnline) return;
    try {
        const res = await fetch(`${API_URL}/licitacoes/${licitacaoId}/itens`, { headers: getHeaders() });
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao carregar itens');
        itens = await res.json();
        renderItens();
        atualizarTotais();
    } catch (err) {
        console.error(err);
        showToast('Erro ao carregar itens', 'error');
        const tbody = document.getElementById('itensContainer');
        if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Erro ao carregar itens</td></tr>';
    }
}

function renderItens() {
    const tbody = document.getElementById('itensContainer');
    if (!tbody) return;
    const search = (document.getElementById('searchItens')?.value || '').toLowerCase();
    const filtered = itens.filter(item =>
        (item.descricao || '').toLowerCase().includes(search) ||
        (item.modelo    || '').toLowerCase().includes(search)
    );
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2.5rem;color:var(--text-muted);">Nenhum item cadastrado</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map((item, idx) => {
        const isCotado = itensCotados.has(item.id);
        return `
        <tr onclick="abrirEdicaoItem('${item.id}')" class="${isCotado ? 'row-cotado' : ''}" style="cursor:pointer;">
            <td>${item.numero || idx+1}</td>
            <td class="descricao-cell">${item.descricao || ''}</td>
            <td>${item.quantidade || 0}</td>
            <td>${item.unidade || ''}</td>
            <td>${item.marca || ''}</td>
            <td>${item.modelo || ''}</td>
            <td>${formatMoney(item.custo_unitario)}</td>
            <td>${formatMoney(item.custo_total)}</td>
            <td>${formatMoney(item.venda_unitario)}</td>
            <td>${formatMoney(item.venda_total)}</td>
            <td>${formatMoney(item.frete)}</td>
            <td>${formatMoney(item.lucro_bruto)}</td>
        </tr>`;
    }).join('');
}

function atualizarTotais() {
    const totalCusto  = itens.reduce((a, i) => a + (parseFloat(i.custo_total)  || 0), 0);
    const totalVenda  = itens.reduce((a, i) => a + (parseFloat(i.venda_total)  || 0), 0);
    const totalFrete  = itens.reduce((a, i) => a + (parseFloat(i.frete)        || 0), 0);
    const totalLucro  = itens.reduce((a, i) => a + (parseFloat(i.lucro_bruto)  || 0), 0);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = formatMoney(val); };
    set('totalCusto',      totalCusto);
    set('totalVenda',      totalVenda);
    set('totalFrete',      totalFrete);
    set('totalLucroBruto', totalLucro);
}

function formatMoney(value) {
    if (value == null || value === '') return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function adicionarItem() {
    editingItemId = null;
    document.getElementById('itemModalTitle').textContent = 'Adicionar Item';
    const proximoNum = itens.length > 0 ? Math.max(...itens.map(i => i.numero || 0)) + 1 : 1;
    document.getElementById('itemNumero').value        = proximoNum;
    document.getElementById('itemDescricao').value     = '';
    document.getElementById('itemQuantidade').value    = '';
    document.getElementById('itemUnidade').value       = 'UN';
    document.getElementById('itemMarca').value         = '';
    document.getElementById('itemModelo').value        = '';
    document.getElementById('itemPrazoEntrega').value  = '';
    document.getElementById('itemFrete').value         = '';
    document.getElementById('itemCustoUnitario').value = '';
    document.getElementById('itemVendaUnitario').value = '';
    recalcularItemTotais();
    switchItemTab('item-tab-geral');
    document.getElementById('itemModal').classList.add('show');
}

function abrirEdicaoItem(itemId) {
    const item = itens.find(i => i.id === itemId);
    if (!item) return;
    editingItemId = item.id;
    document.getElementById('itemModalTitle').textContent = 'Editar Item';
    document.getElementById('itemNumero').value        = item.numero        || '';
    document.getElementById('itemDescricao').value     = item.descricao     || '';
    document.getElementById('itemQuantidade').value    = item.quantidade    || '';
    document.getElementById('itemUnidade').value       = item.unidade       || 'UN';
    document.getElementById('itemMarca').value         = item.marca         || '';
    document.getElementById('itemModelo').value        = item.modelo        || '';
    document.getElementById('itemPrazoEntrega').value  = item.prazo_entrega || '';
    document.getElementById('itemFrete').value         = item.frete         || '';
    document.getElementById('itemCustoUnitario').value = item.custo_unitario|| '';
    document.getElementById('itemVendaUnitario').value = item.venda_unitario|| '';
    recalcularItemTotais();
    switchItemTab('item-tab-geral');
    document.getElementById('itemModal').classList.add('show');
}

function fecharItemModal() {
    const modal = document.getElementById('itemModal');
    if (modal) modal.classList.remove('show');
    editingItemId = null;
}

function recalcularItemTotais() {
    const qtd       = parseFloat(document.getElementById('itemQuantidade')?.value)    || 0;
    const custoUnit = parseFloat(document.getElementById('itemCustoUnitario')?.value) || 0;
    const vendaUnit = parseFloat(document.getElementById('itemVendaUnitario')?.value) || 0;
    const frete     = parseFloat(document.getElementById('itemFrete')?.value)         || 0;

    const custoTotal  = qtd * custoUnit;
    const vendaTotal  = qtd * vendaUnit;
    const lucroBruto  = vendaTotal - custoTotal - frete; // frete desconta do lucro

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = formatMoney(val); };
    set('itemCustoTotal',   custoTotal);
    set('itemVendaTotal',   vendaTotal);
    set('itemFreteDisplay', frete);
    set('itemLucroBruto',   lucroBruto);
}

async function salvarItem() {
    const itemData = {
        numero:         parseInt(document.getElementById('itemNumero').value),
        descricao:      document.getElementById('itemDescricao').value.trim(),
        quantidade:     parseFloat(document.getElementById('itemQuantidade').value),
        unidade:        document.getElementById('itemUnidade').value.trim(),
        marca:          document.getElementById('itemMarca').value.trim(),
        modelo:         document.getElementById('itemModelo').value.trim(),
        custo_unitario: parseFloat(document.getElementById('itemCustoUnitario').value) || 0,
        venda_unitario: parseFloat(document.getElementById('itemVendaUnitario').value) || 0,
        prazo_entrega:  document.getElementById('itemPrazoEntrega').value.trim(),
        frete:          parseFloat(document.getElementById('itemFrete').value) || 0,
    };
    if (!itemData.descricao || isNaN(itemData.quantidade) || itemData.quantidade <= 0) {
        showToast('Descrição e quantidade são obrigatórios', 'error'); return;
    }
    itemData.custo_total  = itemData.custo_unitario * itemData.quantidade;
    itemData.venda_total  = itemData.venda_unitario * itemData.quantidade;
    itemData.lucro_bruto  = itemData.venda_total - itemData.custo_total - itemData.frete;

    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    try {
        const url    = editingItemId
            ? `${API_URL}/licitacoes/${currentLicitacaoId}/itens/${editingItemId}`
            : `${API_URL}/licitacoes/${currentLicitacaoId}/itens`;
        const method = editingItemId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify(itemData)
        });
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao salvar item');
        const saved = await res.json();
        if (method === 'POST') {
            itens.push(saved);
        } else {
            const idx = itens.findIndex(i => i.id === saved.id);
            if (idx !== -1) itens[idx] = saved;
        }
        fecharItemModal();
        renderItens();
        atualizarTotais();
        showToast('Item salvo com sucesso', 'success');
    } catch (err) { showToast(err.message, 'error'); }
}

function filterItens() { renderItens(); }

function syncItens() {
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    if (!currentLicitacaoId) { showToast('Nenhuma proposta selecionada', 'error'); return; }
    carregarItens(currentLicitacaoId)
        .then(() => showToast('Itens sincronizados!', 'success'))
        .catch(() => showToast('Erro ao sincronizar', 'error'));
}

function switchItemTab(tabId) {
    const modal = document.getElementById('itemModal');
    if (!modal) return;
    modal.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
    modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const btn = modal.querySelector(`.tab-btn[onclick*="${tabId}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById(tabId);
    if (content) content.classList.add('active');
}

// ========== COTAÇÃO ==========
function saudacao() {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
}

function abrirModalCotacao() {
    if (!itens.length) { showToast('Nenhum item cadastrado nesta proposta', 'error'); return; }
    const marcas = [...new Set(itens.map(i => i.marca).filter(Boolean))].sort();
    if (!marcas.length) { showToast('Nenhum item possui marca cadastrada', 'error'); return; }

    const select = document.getElementById('cotacaoFornecedorSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a marca...</option>' +
        marcas.map(m => `<option value="${m}">${m}</option>`).join('');

    // Reseta tipo para descrição
    cotacaoTipoAtual = 'descricao';
    selecionarTipoCotacao('descricao');

    document.getElementById('modalCotacaoItens').classList.add('show');
}

function fecharModalCotacao() {
    const modal = document.getElementById('modalCotacaoItens');
    if (modal) modal.classList.remove('show');
}

async function enviarCotacao() {
    const marcaSelecionada = document.getElementById('cotacaoFornecedorSelect')?.value;
    if (!marcaSelecionada) { showToast('Selecione uma marca/fornecedor', 'error'); return; }

    const tipo = cotacaoTipoAtual;
    const itensDaMarca = itens.filter(i => (i.marca || '').toLowerCase() === marcaSelecionada.toLowerCase());

    const linhas = itensDaMarca
        .filter(item => tipo === 'modelo' ? (item.modelo || item.descricao) : item.descricao)
        .map((item, idx) => {
            const campo   = tipo === 'modelo' ? (item.modelo || item.descricao || '') : (item.descricao || '');
            const unidade = item.unidade ? ` ${item.unidade}` : '';
            return `${idx + 1} - ${campo}\nQuantidade: ${item.quantidade}${unidade}`;
        });

    if (!linhas.length) { showToast('Nenhum item com esta marca para cotar', 'error'); return; }

    const mensagem = `${saudacao()}!\nGostaria de pedir, por gentileza, um orçamento para:\n\n${linhas.join('\n\n')}`;

    if (!isOnline) { showToast('Sistema offline', 'error'); return; }

    const btn   = document.getElementById('btnEnviarCotacao');
    const label = document.getElementById('btnEnviarCotacaoLabel');
    if (btn)   btn.disabled       = true;
    if (label) label.textContent  = 'Buscando...';

    try {
        const res = await fetch(`${API_URL}/fornecedores?search=${encodeURIComponent(marcaSelecionada)}&limit=20`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error('Erro ao buscar fornecedor');
        const resultado = await res.json();
        const lista     = Array.isArray(resultado) ? resultado : (resultado.data || []);
        const fornecedor = lista.find(f => f.nome.trim().toLowerCase() === marcaSelecionada.trim().toLowerCase());

        if (!fornecedor) { showToast('Fornecedor não encontrado', 'error'); return; }

        const metodo     = fornecedor.metodo_envio || 'whatsapp';
        const msgEncoded = encodeURIComponent(mensagem);

        // Marca itens da marca como cotados (azul)
        itensDaMarca.forEach(i => itensCotados.add(i.id));
        renderItens();

        fecharModalCotacao();

        if (metodo === 'whatsapp') {
            const celular = (fornecedor.celular || fornecedor.telefone || '').replace(/\D/g, '');
            if (!celular) { showToast('Fornecedor sem número de WhatsApp cadastrado', 'error'); return; }
            window.open(`https://wa.me/${celular}?text=${msgEncoded}`, '_blank');
        } else {
            if (!fornecedor.email) { showToast('Fornecedor sem e-mail cadastrado', 'error'); return; }
            const proposta = licitacoes.find(l => l.id === currentLicitacaoId);
            const assunto  = encodeURIComponent(
                `Solicitação de Orçamento${proposta ? ' — Proposta Nº ' + proposta.numero_proposta : ''}`
            );
            window.location.href = `mailto:${fornecedor.email}?subject=${assunto}&body=${msgEncoded}`;
        }
    } catch (err) {
        showToast(err.message || 'Erro ao enviar cotação', 'error');
    } finally {
        if (btn)   btn.disabled      = false;
        if (label) label.textContent = 'Enviar';
    }
}

// ========== UTILITÁRIOS ==========
function showToast(msg, tipo = 'success') {
    document.querySelectorAll('.floating-message').forEach(m => m.remove());
    const d = document.createElement('div');
    d.className  = `floating-message ${tipo}`;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => {
        d.style.animation = 'slideOutBottom 0.22s ease forwards';
        setTimeout(() => d.remove(), 220);
    }, 3000);
}

// ========== EXPOSIÇÃO GLOBAL ==========
window.openFormModal          = openFormModal;
window.closeFormModal         = closeFormModal;
window.salvarLicitacao        = salvarLicitacao;
window.editLicitacao          = editLicitacao;
window.openDeleteModal        = openDeleteModal;
window.closeDeleteModal       = closeDeleteModal;
window.confirmarExclusao      = confirmarExclusao;
window.filterLicitacoes       = filterLicitacoes;
window.syncData               = syncData;
window.changeMonth            = changeMonth;
window.toggleCalendar         = toggleCalendar;
window.viewLicitacao          = viewLicitacao;
window.voltar                 = voltar;
window.abrirModalVencidos     = abrirModalVencidos;
window.fecharModalVencidos    = fecharModalVencidos;
window.vencidosPageChange     = vencidosPageChange;
window.adicionarItem          = adicionarItem;
window.abrirEdicaoItem        = abrirEdicaoItem;
window.salvarItem             = salvarItem;
window.fecharItemModal        = fecharItemModal;
window.filterItens            = filterItens;
window.syncItens              = syncItens;
window.abrirModalCotacao      = abrirModalCotacao;
window.fecharModalCotacao     = fecharModalCotacao;
window.enviarCotacao          = enviarCotacao;
window.switchItemTab          = switchItemTab;
window.toggleStatus           = toggleStatus;
window.recalcularItemTotais   = recalcularItemTotais;
window.selecionarTipoCotacao  = selecionarTipoCotacao;
