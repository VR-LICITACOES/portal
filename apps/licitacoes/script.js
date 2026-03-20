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
    setInterval(verificarPrazosVencidos, 60000); // verifica a cada minuto
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
    document.getElementById('currentMonth').textContent = isAllMonths ? 'Todos os meses' : `${monthName} ${year}`;
}

function changeMonth(direction) {
    if (isAllMonths) {
        isAllMonths = false;
        currentMonth = new Date();
    } else {
        currentMonth.setMonth(currentMonth.getMonth() + direction);
    }
    updateMonthDisplay();
    loadLicitacoes();
}

function resetToAllMonths() {
    isAllMonths = true;
    updateMonthDisplay();
    loadLicitacoes();
}

// ========== CARREGAR LICITAÇÕES ==========
async function loadLicitacoes() {
    if (!isOnline) return;
    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;

    let url = `${API_URL}/licitacoes`;
    if (!isAllMonths) {
        url += `?mes=${currentMonth.getMonth()+1}&ano=${currentMonth.getFullYear()}`;
    }

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
        verificarPrazosVencidos(); // verifica após carregar
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
}

function filterLicitacoes() {
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    const filtered = licitacoes.filter(l => 
        l.numero_proposta.toLowerCase().includes(search) ||
        (l.uf && l.uf.toLowerCase().includes(search))
    );
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
        loadLicitacoes(); // recarrega para garantir consistência de mês
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

// ========== TELA DE ITENS ==========
function mostrarTelaItens() {
    document.querySelector('.container').style.display = 'none';
    let tela = document.getElementById('telaItens');
    if (!tela) {
        tela = criarTelaItens();
        document.body.querySelector('.app-content').appendChild(tela);
    }
    tela.style.display = 'block';
    const lic = licitacoes.find(l => l.id === currentLicitacaoId);
    if (lic) {
        const titulo = document.getElementById('tituloItens');
        if (titulo) titulo.textContent = `Proposta Nº ${lic.numero_proposta}`;
    }
}

function criarTelaItens() {
    const div = document.createElement('div');
    div.id = 'telaItens';
    div.className = 'container';
    div.innerHTML = `
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Itens da Proposta</h1>
                    <p id="tituloItens" style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px;"></p>
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items:center;">
                <button onclick="adicionarItem()" style="background: #22C55E; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">+ Item</button>
                <button onclick="abrirModalIntervalo()" style="background: #6B7280; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">+ Intervalo</button>
                <button onclick="abrirModalExcluirItens()" style="background: #EF4444; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">Excluir</button>
                <button onclick="abrirModalCotacao()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem;" title="Cotação">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </button>
                <button onclick="syncItens()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem;" title="Sincronizar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
                <button onclick="voltar()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem;" title="Voltar">
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
                        <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
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

        <!-- MODAIS DE ITENS -->
        <div class="modal-overlay" id="modalIntervalo">
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header"><h3>Adicionar Intervalo</h3><button class="close-modal" onclick="fecharModalIntervalo()">✕</button></div>
                <div class="form-grid">
                    <div class="form-group"><label>Intervalo (ex: 1-5, 10)</label><input type="text" id="inputIntervalo" placeholder="Ex: 1-5, 10, 15-20"></div>
                </div>
                <div class="modal-actions">
                    <button class="secondary" onclick="fecharModalIntervalo()">Cancelar</button>
                    <button class="success" onclick="confirmarAdicionarIntervalo()">Adicionar</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay" id="modalExcluirItens">
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header"><h3>Excluir Itens</h3><button class="close-modal" onclick="fecharModalExcluirItens()">✕</button></div>
                <div class="form-grid">
                    <div class="form-group"><label>Intervalo a excluir</label><input type="text" id="inputExcluirIntervalo" placeholder="Ex: 1-5, 10"></div>
                </div>
                <div class="modal-actions">
                    <button class="secondary" onclick="fecharModalExcluirItens()">Cancelar</button>
                    <button class="danger" onclick="confirmarExcluirItens()">Excluir</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay" id="modalItem">
            <div class="modal-content large" style="max-width:680px;">
                <div class="modal-header">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <button id="btnPrevPagItem" onclick="navegarItemAnterior()" style="background:none;border:none;color:var(--text-secondary);font-size:1.1rem;visibility:hidden;">‹</button>
                        <h3 class="modal-title" id="modalItemTitle">Item</h3>
                        <button id="btnNextPagItem" onclick="navegarProximoItem()" style="background:none;border:none;color:var(--text-secondary);font-size:1.1rem;visibility:hidden;">›</button>
                    </div>
                    <button class="close-modal" onclick="fecharModalItem()">✕</button>
                </div>
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchItemTab('item-tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchItemTab('item-tab-transporte')">Transporte</button>
                        <button class="tab-btn" onclick="switchItemTab('item-tab-valores')">Valores</button>
                    </div>
                    <div class="tab-content active" id="item-tab-geral">
                        <input type="hidden" id="itemNumero">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>ITEM *</label>
                                <input type="number" id="itemNumeroGeral" min="1" required>
                            </div>
                            <div class="form-group">
                                <label>QTD *</label>
                                <input type="number" id="itemQtd" min="1" value="1" required>
                            </div>
                            <div class="form-group">
                                <label>UND *</label>
                                <select id="itemUnidade">
                                    <option value="UN">UN</option><option value="CX">CX</option><option value="MT">MT</option><option value="PCT">PCT</option>
                                </select>
                            </div>
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label>DESCRIÇÃO *</label>
                                <textarea id="itemDescricao" rows="3" required></textarea>
                            </div>
                            <div class="form-group">
                                <label>MARCA</label>
                                <input type="text" id="itemMarca">
                            </div>
                            <div class="form-group">
                                <label>MODELO</label>
                                <input type="text" id="itemModelo">
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="item-tab-transporte">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>PRAZO ENTREGA</label>
                                <input type="text" id="itemPrazoEntrega" placeholder="Ex: 30 DIAS">
                            </div>
                            <div class="form-group">
                                <label>FRETE (R$)</label>
                                <input type="number" id="itemFrete" step="0.01" min="0" value="0">
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="item-tab-valores">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>CUSTO UNT</label>
                                <input type="number" id="itemCustoUnt" step="0.0001" min="0" value="0">
                            </div>
                            <div class="form-group">
                                <label>CUSTO TOTAL</label>
                                <input type="number" id="itemCustoTotal" step="0.01" min="0" value="0" readonly>
                            </div>
                            <div class="form-group">
                                <label>VENDA UNT</label>
                                <input type="number" id="itemVendaUnt" step="0.0001" min="0" value="0">
                            </div>
                            <div class="form-group">
                                <label>VENDA TOTAL</label>
                                <input type="number" id="itemVendaTotal" step="0.01" min="0" value="0" readonly>
                            </div>
                            <div class="form-group">
                                <label>LUCRO BR</label>
                                <input type="number" id="itemLucroBr" step="0.01" min="0" value="0" readonly>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button id="btnItemTabPrev" onclick="prevItemTab()" class="secondary" style="display:none;">Anterior</button>
                    <button id="btnItemTabNext" onclick="nextItemTab()" class="secondary">Próximo</button>
                    <button id="btnSalvarItem" onclick="salvarItemAtual()" class="success" style="display:none;">Salvar</button>
                    <button onclick="fecharModalItem()" class="danger">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    return div;
}

// ========== ITENS CRUD ==========
let currentItemTab = 0;
const itemTabs = ['item-tab-geral', 'item-tab-transporte', 'item-tab-valores'];

function switchItemTab(tabId) {
    itemTabs.forEach((t,i) => {
        document.getElementById(t)?.classList.remove('active');
        document.querySelectorAll('#modalItem .tab-btn')[i]?.classList.remove('active');
    });
    document.getElementById(tabId)?.classList.add('active');
    const idx = itemTabs.indexOf(tabId);
    document.querySelectorAll('#modalItem .tab-btn')[idx]?.classList.add('active');
    currentItemTab = idx;
    const prev = document.getElementById('btnItemTabPrev');
    const next = document.getElementById('btnItemTabNext');
    const save = document.getElementById('btnSalvarItem');
    if (prev) prev.style.display = idx === 0 ? 'none' : 'inline-block';
    if (next) next.style.display = idx === 2 ? 'none' : 'inline-block';
    if (save) save.style.display = idx === 2 ? 'inline-block' : 'none';
}

function nextItemTab() { if (currentItemTab < 2) { currentItemTab++; switchItemTab(itemTabs[currentItemTab]); } }
function prevItemTab() { if (currentItemTab > 0) { currentItemTab--; switchItemTab(itemTabs[currentItemTab]); } }

async function carregarItens(id) {
    try {
        const res = await fetch(`${API_URL}/licitacoes/${id}/itens`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Erro ao carregar itens');
        itens = await res.json();
        atualizarMarcasItens();
        renderItens();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function atualizarMarcasItens() {
    const marcas = [...new Set(itens.map(i => i.marca).filter(Boolean))];
    const select = document.getElementById('filterMarcaItens');
    if (!select) return;
    const cur = select.value;
    select.innerHTML = '<option value="">Marca</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
    select.value = cur;
}

function filterItens() {
    const search = (document.getElementById('searchItens')?.value || '').toLowerCase();
    const marca = document.getElementById('filterMarcaItens')?.value || '';
    const filtered = itens.filter(i => 
        (!search || i.descricao?.toLowerCase().includes(search) || i.numero.toString().includes(search)) &&
        (!marca || i.marca === marca)
    );
    renderItens(filtered);
}

function renderItens(lista = itens) {
    const tbody = document.getElementById('itensContainer');
    if (!tbody) return;
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2rem;">Nenhum item cadastrado</td></tr>';
        return;
    }
    let totCusto = 0, totVenda = 0;
    const rows = lista.map(i => {
        totCusto += i.custo_total || 0;
        totVenda += i.venda_total || 0;
        const cbId = `cb-${i.id}`;
        return `
        <tr ondblclick="editarItem('${i.id}')" oncontextmenu="showItemContextMenu(event,'${i.id}')">
            <td style="text-align:center;"><input type="checkbox" class="item-checkbox" data-id="${i.id}" ${i.enviado ? 'checked' : ''} onchange="toggleItemEnviado('${i.id}',this.checked)"></td>
            <td>${i.numero}</td>
            <td class="descricao-cell">${i.descricao || '-'}</td>
            <td>${i.qtd}</td>
            <td>${i.unidade}</td>
            <td>${i.marca || '-'}</td>
            <td>${i.modelo || '-'}</td>
            <td style="text-align:right;">R$ ${(i.custo_unt || 0).toFixed(2)}</td>
            <td style="text-align:right;">R$ ${(i.custo_total || 0).toFixed(2)}</td>
            <td style="text-align:right;">R$ ${(i.venda_unt || 0).toFixed(2)}</td>
            <td style="text-align:right;">R$ ${(i.venda_total || 0).toFixed(2)}</td>
        </tr>
    `}).join('');
    tbody.innerHTML = rows;
    const bar = document.getElementById('itensTotaisBar');
    if (bar) bar.innerHTML = `
        <span><strong>CUSTO TOTAL:</strong> R$ ${totCusto.toFixed(2)}</span>
        <span><strong>VENDA TOTAL:</strong> R$ ${totVenda.toFixed(2)}</span>
        <span><strong>LUCRO BR:</strong> R$ ${(totVenda - totCusto).toFixed(2)}</span>
    `;
}

async function toggleItemEnviado(id, checked) {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    item.enviado = checked;
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ enviado: checked })
        });
        if (!res.ok) throw new Error('Erro ao atualizar');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function showItemContextMenu(e, id) {
    e.preventDefault();
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.style.cssText = 'position:fixed; left:'+e.clientX+'px; top:'+e.clientY+'px; background:white; border:1px solid #E5E7EB; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10000; min-width:150px; padding:0.5rem 0;';
    menu.innerHTML = '<div onclick="excluirItemContexto(\''+id+'\')" style="padding:0.75rem 1rem; cursor:pointer; color:#EF4444; display:flex; align-items:center; gap:0.5rem;" onmouseover="this.style.background=\'#FEE2E2\'" onmouseout="this.style.background=\'white\'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Excluir</div>';
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
}

async function excluirItemContexto(id) {
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/${id}`, {
            method: 'DELETE', headers: getHeaders()
        });
        if (!res.ok) throw new Error('Erro ao excluir');
        itens = itens.filter(i => i.id !== id);
        renderItens();
        atualizarMarcasItens();
        showToast('Item excluído', 'error');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function adicionarItem() {
    const proxNum = itens.length ? Math.max(...itens.map(i => i.numero)) + 1 : 1;
    const novoItem = {
        numero: proxNum,
        descricao: '',
        qtd: 1,
        unidade: 'UN',
        marca: '',
        modelo: '',
        prazo_entrega: '',
        frete: 0,
        custo_unt: 0,
        custo_total: 0,
        venda_unt: 0,
        venda_total: 0,
        lucro_br: 0,
        enviado: false
    };
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify(novoItem)
        });
        if (!res.ok) throw new Error('Erro ao criar item');
        const saved = await res.json();
        itens.push(saved);
        atualizarMarcasItens();
        renderItens();
        showToast('Item criado', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function parsearIntervalo(str) {
    const nums = [];
    const partes = str.split(',').map(p => p.trim());
    for (const parte of partes) {
        if (parte.includes('-')) {
            const [a,b] = parte.split('-').map(Number);
            if (isNaN(a) || isNaN(b) || a > b) return null;
            for (let i=a; i<=b; i++) nums.push(i);
        } else {
            const n = Number(parte);
            if (isNaN(n)) return null;
            nums.push(n);
        }
    }
    return nums;
}

function abrirModalIntervalo() { document.getElementById('modalIntervalo').classList.add('show'); }
function fecharModalIntervalo() { document.getElementById('modalIntervalo').classList.remove('show'); }

async function confirmarAdicionarIntervalo() {
    const str = document.getElementById('inputIntervalo').value.trim();
    fecharModalIntervalo();
    if (!str) return;
    const nums = parsearIntervalo(str);
    if (!nums) { showToast('Intervalo inválido', 'error'); return; }
    const existentes = new Set(itens.map(i => i.numero));
    const novos = nums.filter(n => !existentes.has(n));
    if (novos.length === 0) { showToast('Todos os números já existem', 'error'); return; }
    for (const num of novos) {
        const novo = {
            numero: num,
            descricao: '',
            qtd: 1,
            unidade: 'UN',
            marca: '',
            modelo: '',
            prazo_entrega: '',
            frete: 0,
            custo_unt: 0,
            custo_total: 0,
            venda_unt: 0,
            venda_total: 0,
            lucro_br: 0,
            enviado: false
        };
        try {
            const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() },
                body: JSON.stringify(novo)
            });
            if (res.ok) {
                const saved = await res.json();
                itens.push(saved);
            }
        } catch (err) {}
    }
    itens.sort((a,b) => a.numero - b.numero);
    atualizarMarcasItens();
    renderItens();
    showToast('Itens adicionados', 'success');
}

function abrirModalExcluirItens() { document.getElementById('modalExcluirItens').classList.add('show'); }
function fecharModalExcluirItens() { document.getElementById('modalExcluirItens').classList.remove('show'); }

async function confirmarExcluirItens() {
    const str = document.getElementById('inputExcluirIntervalo').value.trim();
    fecharModalExcluirItens();
    if (!str) return;
    const nums = parsearIntervalo(str);
    if (!nums) { showToast('Intervalo inválido', 'error'); return; }
    const ids = itens.filter(i => nums.includes(i.numero)).map(i => i.id);
    if (ids.length === 0) { showToast('Nenhum item encontrado', 'error'); return; }
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/delete-multiple`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ ids })
        });
        if (!res.ok) throw new Error('Erro ao excluir');
        itens = itens.filter(i => !ids.includes(i.id));
        atualizarMarcasItens();
        renderItens();
        showToast('Itens excluídos', 'error');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function editarItem(id) {
    const idx = itens.findIndex(i => i.id === id);
    if (idx === -1) return;
    editingItemIndex = idx;
    mostrarModalItem(itens[idx]);
}

function mostrarModalItem(item) {
    document.getElementById('itemNumero').value = item.numero;
    document.getElementById('itemNumeroGeral').value = item.numero;
    document.getElementById('itemDescricao').value = item.descricao || '';
    document.getElementById('itemQtd').value = item.qtd;
    document.getElementById('itemUnidade').value = item.unidade || 'UN';
    document.getElementById('itemMarca').value = item.marca || '';
    document.getElementById('itemModelo').value = item.modelo || '';
    document.getElementById('itemPrazoEntrega').value = item.prazo_entrega || '';
    document.getElementById('itemFrete').value = item.frete || 0;
    document.getElementById('itemCustoUnt').value = item.custo_unt || 0;
    document.getElementById('itemCustoTotal').value = item.custo_total || 0;
    document.getElementById('itemVendaUnt').value = item.venda_unt || 0;
    document.getElementById('itemVendaTotal').value = item.venda_total || 0;
    document.getElementById('itemLucroBr').value = item.lucro_br || 0;
    document.getElementById('modalItemTitle').textContent = `Item ${item.numero}`;
    const prev = document.getElementById('btnPrevPagItem');
    const next = document.getElementById('btnNextPagItem');
    if (prev) prev.style.visibility = editingItemIndex > 0 ? 'visible' : 'hidden';
    if (next) next.style.visibility = editingItemIndex < itens.length-1 ? 'visible' : 'hidden';
    switchItemTab('item-tab-geral');
    document.getElementById('modalItem').classList.add('show');
    configurarCalculos();
}

function configurarCalculos() {
    const unt = document.getElementById('itemCustoUnt');
    const qtd = document.getElementById('itemQtd');
    const vUnt = document.getElementById('itemVendaUnt');
    const vTot = document.getElementById('itemVendaTotal');
    const cTot = document.getElementById('itemCustoTotal');
    const lucro = document.getElementById('itemLucroBr');
    const recalcular = () => {
        const cu = parseFloat(unt.value) || 0;
        const qt = parseFloat(qtd.value) || 1;
        const vu = parseFloat(vUnt.value) || 0;
        cTot.value = (cu * qt).toFixed(2);
        vTot.value = (vu * qt).toFixed(2);
        lucro.value = ((vu * qt) - (cu * qt)).toFixed(2);
    };
    unt.addEventListener('input', recalcular);
    qtd.addEventListener('input', recalcular);
    vUnt.addEventListener('input', recalcular);
    recalcular();
}

function navegarItemAnterior() {
    if (editingItemIndex > 0) {
        salvarItemAtual(false);
        editingItemIndex--;
        mostrarModalItem(itens[editingItemIndex]);
    }
}

function navegarProximoItem() {
    if (editingItemIndex < itens.length - 1) {
        salvarItemAtual(false);
        editingItemIndex++;
        mostrarModalItem(itens[editingItemIndex]);
    }
}

async function salvarItemAtual(fechar = true) {
    const idx = editingItemIndex;
    const item = itens[idx];
    item.numero = parseInt(document.getElementById('itemNumeroGeral').value) || item.numero;
    item.descricao = document.getElementById('itemDescricao').value.toUpperCase();
    item.qtd = parseFloat(document.getElementById('itemQtd').value) || 1;
    item.unidade = document.getElementById('itemUnidade').value;
    item.marca = document.getElementById('itemMarca').value.toUpperCase() || null;
    item.modelo = document.getElementById('itemModelo').value.toUpperCase() || null;
    item.prazo_entrega = document.getElementById('itemPrazoEntrega').value.toUpperCase() || null;
    item.frete = parseFloat(document.getElementById('itemFrete').value) || 0;
    item.custo_unt = parseFloat(document.getElementById('itemCustoUnt').value) || 0;
    item.custo_total = parseFloat(document.getElementById('itemCustoTotal').value) || 0;
    item.venda_unt = parseFloat(document.getElementById('itemVendaUnt').value) || 0;
    item.venda_total = parseFloat(document.getElementById('itemVendaTotal').value) || 0;
    item.lucro_br = parseFloat(document.getElementById('itemLucroBr').value) || 0;
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/${item.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify(item)
        });
        if (!res.ok) throw new Error('Erro ao salvar');
        const saved = await res.json();
        itens[idx] = saved;
        if (fechar) {
            fecharModalItem();
            atualizarMarcasItens();
            renderItens();
            showToast('Item salvo', 'success');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function fecharModalItem() {
    document.getElementById('modalItem').classList.remove('show');
    editingItemIndex = null;
}

function syncItens() { carregarItens(currentLicitacaoId); showToast('Sincronizado', 'success'); }

// ========== ALERTA PRAZO VENCIDO ==========
function verificarPrazosVencidos() {
    const hoje = new Date().toISOString().split('T')[0];
    const vencidas = licitacoes.filter(l => l.status === 'ABERTA' && l.data === hoje);
    if (vencidas.length > 0) {
        const card = document.getElementById('prazoVencidoCard');
        card.classList.add('has-alert');
        card.style.position = 'relative';
        let badge = card.querySelector('.pulse-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pulse-badge';
            badge.textContent = vencidas.length;
            card.appendChild(badge);
        } else {
            badge.textContent = vencidas.length;
        }
        const modal = document.getElementById('alertaVencidoModal');
        if (!modal.classList.contains('show')) {
            const lista = document.getElementById('propostasVencidasLista');
            if (lista) {
                lista.innerHTML = vencidas.map(l => `<div style="padding:0.5rem; border-bottom:1px solid var(--border-color);">${l.numero_proposta} - ${new Date(l.data).toLocaleDateString()}</div>`).join('');
            }
            modal.classList.add('show');
        }
    } else {
        const card = document.getElementById('prazoVencidoCard');
        card.classList.remove('has-alert');
        const badge = card.querySelector('.pulse-badge');
        if (badge) badge.remove();
    }
}

function fecharAlertaVencido() {
    document.getElementById('alertaVencidoModal').classList.remove('show');
}

// ========== COTAÇÃO ==========
function abrirModalCotacao() {
    const marcas = [...new Set(itens.map(i => i.marca).filter(Boolean))].sort();
    const select = document.getElementById('cotacaoFornecedor');
    select.innerHTML = '<option value="">Selecione...</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
    document.getElementById('cotacaoMensagem').value = '';
    document.getElementById('modalCotacao').classList.add('show');
}
function fecharModalCotacao() { document.getElementById('modalCotacao').classList.remove('show'); }
function gerarMensagemCotacao() {
    const marca = document.getElementById('cotacaoFornecedor').value;
    const tipo = document.getElementById('cotacaoTipo').value;
    if (!marca) { document.getElementById('cotacaoMensagem').value = ''; return; }
    const itensFilt = itens.filter(i => i.marca === marca);
    if (!itensFilt.length) { document.getElementById('cotacaoMensagem').value = 'Nenhum item com esta marca.'; return; }
    let msg = `Bom dia!\n\nSolicito, por gentileza, um orçamento para os itens abaixo:\n\n`;
    itensFilt.forEach((item, idx) => {
        const desc = tipo === 'descricao' ? item.descricao : (item.modelo || item.descricao);
        msg += `${idx+1} - ${desc}\n${item.qtd} ${item.unidade}\n\n`;
    });
    document.getElementById('cotacaoMensagem').value = msg;
}
function copiarMensagemCotacao() {
    const msg = document.getElementById('cotacaoMensagem').value;
    if (!msg) return;
    navigator.clipboard.writeText(msg).then(() => showToast('Mensagem copiada!', 'success')).catch(() => showToast('Erro ao copiar', 'error'));
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

// Expor funções globais
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
window.resetToAllMonths = resetToAllMonths;
window.toggleCalendar = toggleCalendar;
window.viewLicitacao = viewLicitacao;
window.voltar = voltar;
window.adicionarItem = adicionarItem;
window.abrirModalIntervalo = abrirModalIntervalo;
window.fecharModalIntervalo = fecharModalIntervalo;
window.confirmarAdicionarIntervalo = confirmarAdicionarIntervalo;
window.abrirModalExcluirItens = abrirModalExcluirItens;
window.fecharModalExcluirItens = fecharModalExcluirItens;
window.confirmarExcluirItens = confirmarExcluirItens;
window.editarItem = editarItem;
window.fecharModalItem = fecharModalItem;
window.salvarItemAtual = salvarItemAtual;
window.navegarItemAnterior = navegarItemAnterior;
window.navegarProximoItem = navegarProximoItem;
window.switchItemTab = switchItemTab;
window.nextItemTab = nextItemTab;
window.prevItemTab = prevItemTab;
window.filterItens = filterItens;
window.syncItens = syncItens;
window.abrirModalCotacao = abrirModalCotacao;
window.fecharModalCotacao = fecharModalCotacao;
window.gerarMensagemCotacao = gerarMensagemCotacao;
window.copiarMensagemCotacao = copiarMensagemCotacao;
window.fecharAlertaVencido = fecharAlertaVencido;
