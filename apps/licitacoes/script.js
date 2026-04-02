// ========== CONFIGURAÇÃO ==========
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:10000/api'
    : `${window.location.origin}/api`;

const PORTAIS = ['SIADES', 'TRANSPETRO', 'LICITAÇÕES-E', 'COMPRASNET', 'PETRONECT'];

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
let currentDateFilter = null;

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
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:var(--bg-primary);color:var(--text-primary);text-align:center;padding:2rem;">
            <h1 style="font-size:2.2rem;margin-bottom:1rem;">NÃO AUTORIZADO</h1>
            <p style="color:var(--text-secondary);margin-bottom:2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="/" style="display:inline-block;background:var(--btn-register);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Ir para o Portal</a>
        </div>`;
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
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    document.getElementById('currentMonth').textContent = `${months[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
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
        if (res.status === 401) {
            sessionStorage.removeItem('licitacoesSession');
            mostrarTelaAcessoNegado();
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

// ========== DASHBOARD / STATS ==========
function updateStats() {
    const total = licitacoes.length;
    const enviadas = licitacoes.filter(l => l.status === 'ENVIADA').length;
    const abertas = licitacoes.filter(l => l.status === 'ABERTA').length;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const atencao = licitacoes.filter(l => {
        if (l.status !== 'ABERTA') return false;
        if (!l.data) return false;
        const [y, m, d] = l.data.split('-').map(Number);
        const dataReg = new Date(y, m - 1, d);
        return dataReg <= hoje;
    });

    document.getElementById('totalLicitacoes').textContent = total;
    document.getElementById('totalEnviadas').textContent = enviadas;
    document.getElementById('totalAbertas').textContent = abertas;
    document.getElementById('totalVencidas').textContent = atencao.length;

    const card = document.getElementById('prazoVencidoCard');
    if (atencao.length > 0) {
        card.classList.add('has-alert');
        let badge = card.querySelector('.pulse-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pulse-badge';
            card.appendChild(badge);
        }
        badge.textContent = atencao.length;

        const alertKey = `alerted_${atencao.map(l=>l.id).sort().join('_')}`;
        if (!sessionStorage.getItem(alertKey)) {
            sessionStorage.setItem(alertKey, '1');
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('⚠️ Licitações com atenção', {
                    body: `${atencao.length} proposta(s) com prazo vencido ou vencendo hoje.`,
                    icon: '/favicon.ico'
                });
            } else if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission().then(perm => {
                    if (perm === 'granted') {
                        new Notification('⚠️ Licitações com atenção', {
                            body: `${atencao.length} proposta(s) com prazo vencido ou vencendo hoje.`,
                            icon: '/favicon.ico'
                        });
                    }
                });
            }
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
    const portalFilter = document.getElementById('filterPortal')?.value || '';

    let filtered = licitacoes.filter(l => {
        const matchSearch = l.numero_proposta.toLowerCase().includes(search) || (l.uf && l.uf.toLowerCase().includes(search));

        let matchStatus = true;
        if (statusFilter) {
            const statusExibido = calcularStatusExibido(l);
            matchStatus = statusExibido === statusFilter;
        }

        let matchPortal = true;
        if (portalFilter) {
            matchPortal = (l.portal || '') === portalFilter;
        }

        return matchSearch && matchStatus && matchPortal;
    });

    if (currentDateFilter) {
        filtered = filtered.filter(l => l.data === currentDateFilter);
    }
    renderLicitacoes(filtered);
}

function formatDateToBR(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function calcularStatusExibido(l) {
    if (l.status === 'ENVIADA') return 'ENVIADA';
    if (!l.data) return l.status;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [y, m, d] = l.data.split('-').map(Number);
    const dataReg = new Date(y, m - 1, d);
    if (dataReg <= hoje) return 'ATENÇÃO';
    return 'ABERTA';
}

function renderPortalBadge(portal) {
    if (!portal) return '<span class="portal-badge portal-badge-none">—</span>';
    const cls = 'portal-badge portal-badge-' + portal.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `<span class="${cls}">${escapeHtml(portal)}</span>`;
}

function renderLicitacoes(lista) {
    const tbody = document.getElementById('licitacoesContainer');
    if (!tbody) return;
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;">Nenhuma proposta encontrada</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(l => {
        const isEnviada = l.status === 'ENVIADA';
        const statusExibido = calcularStatusExibido(l);
        const badgeClass = statusExibido === 'ENVIADA' ? 'success' : statusExibido === 'ATENÇÃO' ? 'atencao' : 'aberta';
        return `
        <tr class="${isEnviada ? 'row-enviada' : ''}">
            <td style="text-align:center;" onclick="event.stopPropagation()">
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="check-${l.id}" class="styled-checkbox" ${isEnviada ? 'checked' : ''} onchange="toggleStatus('${l.id}')">
                    <label for="check-${l.id}" class="checkbox-label-styled"></label>
                </div>
            </td>
            <td onclick="viewLicitacao('${l.id}')">${renderPortalBadge(l.portal)}</td>
            <td onclick="viewLicitacao('${l.id}')"><strong>${escapeHtml(l.numero_proposta)}</strong></td>
            <td onclick="viewLicitacao('${l.id}')">${formatDateToBR(l.data)}</td>
            <td onclick="viewLicitacao('${l.id}')">${l.hora || '-'}</td>
            <td onclick="viewLicitacao('${l.id}')">${l.uf || '-'}</td>
            <td onclick="viewLicitacao('${l.id}')" class="status-col">
                <span class="status-badge ${badgeClass}">${statusExibido}</span>
            </td>
            <td class="actions-cell" onclick="event.stopPropagation()">
                <button class="action-btn edit" onclick="openFormModal('${l.id}')" title="Editar">Editar</button>
                <button class="action-btn delete" onclick="openDeleteModal('${l.id}')" title="Excluir">Excluir</button>
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
            res = await fetch(`${API_URL}/licitacoes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getHeaders() },
                body: JSON.stringify({ ...proposta, status: novoStatus })
            });
        }
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
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
function garantirFormModal() {
    if (document.getElementById('formModal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'formModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="formTitle">Nova Proposta</h3>
                <button class="close-modal" onclick="closeFormModal()">✕</button>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Portal</label>
                    <select id="portalProposta">
                        <option value="">— Sem portal —</option>
                        ${PORTAIS.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Nº Proposta *</label>
                    <input type="text" id="numeroProposta" placeholder="Ex: 12345/2025">
                </div>
                <div class="form-group">
                    <label>Data *</label>
                    <input type="date" id="dataProposta">
                </div>
                <div class="form-group">
                    <label>Hora</label>
                    <input type="time" id="horaProposta">
                </div>
                <div class="form-group">
                    <label>Local de Entrega</label>
                    <input type="text" id="ufProposta" placeholder="UF ou cidade">
                </div>
            </div>
            <div class="modal-actions">
                <button class="success" onclick="salvarLicitacao()">Salvar</button>
                <button class="danger" onclick="closeFormModal()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openFormModal(editId = null) {
    garantirFormModal();
    editingId = editId;
    document.getElementById('formTitle').textContent = editId ? 'Editar Proposta' : 'Nova Proposta';
    if (editId) {
        const l = licitacoes.find(l => l.id === editId);
        document.getElementById('portalProposta').value = l.portal || '';
        document.getElementById('numeroProposta').value = l.numero_proposta;
        document.getElementById('dataProposta').value = l.data;
        document.getElementById('horaProposta').value = l.hora || '';
        document.getElementById('ufProposta').value = l.uf || '';
    } else {
        document.getElementById('portalProposta').value = '';
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
        portal: document.getElementById('portalProposta').value || null,
        numero_proposta: document.getElementById('numeroProposta').value.trim(),
        data: document.getElementById('dataProposta').value,
        hora: document.getElementById('horaProposta').value || null,
        uf: document.getElementById('ufProposta').value || null,
        status: 'ABERTA'
    };
    if (!data.numero_proposta || !data.data) { showToast('Número e data são obrigatórios', 'error'); return; }
    if (!isOnline) { showToast('Sistema offline', 'error'); closeFormModal(false); return; }
    try {
        const url = editingId ? `${API_URL}/licitacoes/${editingId}` : `${API_URL}/licitacoes`;
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

// ========== MODAL PRAZO VENCIDO / ATENÇÃO ==========
function abrirModalVencidos() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const atencao = licitacoes.filter(l => {
        if (l.status !== 'ABERTA') return false;
        if (!l.data) return false;
        const [y, m, d] = l.data.split('-').map(Number);
        const dataReg = new Date(y, m - 1, d);
        return dataReg <= hoje;
    });

    vencidosPage = 1;
    renderVencidosModal(atencao);
    document.getElementById('modalVencidos').classList.add('show');
}

function renderVencidosModal(vencidas) {
    const start = (vencidosPage - 1) * VENCIDOS_PAGE_SIZE;
    const pageData = vencidas.slice(start, start + VENCIDOS_PAGE_SIZE);
    const totalPages = Math.ceil(vencidas.length / VENCIDOS_PAGE_SIZE);
    const tbody = document.getElementById('vencidosTableBody');
    if (!tbody) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    tbody.innerHTML = pageData.length === 0
        ? '<tr><td colspan="4" style="text-align:center;">Nenhuma proposta requer atenção</td></tr>'
        : pageData.map(l => {
            const [y, m, d] = l.data.split('-').map(Number);
            const dataReg = new Date(y, m - 1, d);
            const isHoje = dataReg.getTime() === hoje.getTime();
            const label = isHoje
                ? '<span style="color:#f97316;font-weight:700;font-size:0.78rem;">HOJE</span>'
                : '<span style="color:#EF4444;font-weight:700;font-size:0.78rem;">VENCIDA</span>';
            return `<tr onclick="viewLicitacao('${l.id}'); fecharModalVencidos();" style="cursor:pointer;">
                <td>${escapeHtml(l.numero_proposta)}</td>
                <td>${formatDateToBR(l.data)}</td>
                <td>${l.hora || '-'}</td>
                <td>${label}</td>
            </tr>`;
        }).join('');

    const pagContainer = document.getElementById('vencidosPaginacao');
    if (pagContainer && totalPages > 1) {
        let h = '<div class="paginacao-btns">';
        h += `<button class="pag-btn" onclick="vencidosPageChange(${vencidosPage-1})" ${vencidosPage===1?'disabled':''}>‹</button>`;
        for (let i = 1; i <= totalPages; i++) h += `<button class="pag-btn ${i===vencidosPage?'pag-btn-active':''}" onclick="vencidosPageChange(${i})">${i}</button>`;
        h += `<button class="pag-btn" onclick="vencidosPageChange(${vencidosPage+1})" ${vencidosPage===totalPages?'disabled':''}>›</button></div>`;
        pagContainer.innerHTML = h;
    } else if (pagContainer) { pagContainer.innerHTML = ''; }
}

function vencidosPageChange(page) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const atencao = licitacoes.filter(l => {
        if (l.status !== 'ABERTA') return false;
        if (!l.data) return false;
        const [y, m, d] = l.data.split('-').map(Number);
        return new Date(y, m - 1, d) <= hoje;
    });
    if (page >= 1 && page <= Math.ceil(atencao.length / VENCIDOS_PAGE_SIZE)) {
        vencidosPage = page;
        renderVencidosModal(atencao);
    }
}

function fecharModalVencidos() {
    document.getElementById('modalVencidos').classList.remove('show');
}

function verificarPrazosVencidos() { updateStats(); }

// ========== SYNC PRINCIPAL ==========
function syncData() {
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    loadLicitacoes()
        .then(() => showToast('Dados sincronizados!', 'success'))
        .catch(() => showToast('Erro ao sincronizar', 'error'));
}

// ========== HELPERS DE LINK ==========
function isLink(value) {
    if (!value) return false;
    return /^https?:\/\//i.test(value.trim()) || /^www\./i.test(value.trim());
}

function normalizeUrl(value) {
    if (!value) return '#';
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://' + v;
}

// ========== TELA DE ITENS ==========
function viewLicitacao(id) {
    currentLicitacaoId = id;
    itens = [];
    mostrarTelaItens();
    carregarItens(id);
}

function voltar() {
    document.getElementById('telaItens').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    currentLicitacaoId = null;
    itens = [];
    closeContextMenu();
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
    const numeroProposta = proposta ? proposta.numero_proposta : '';

    tela.innerHTML = `
        <div class="container" id="containerItens">
            <!-- HEADER -->
            <div class="header">
                <div class="header-left">
                    <div>
                        <h1>Itens da Proposta</h1>
                        <p class="proposta-subtitulo">Proposta Nº ${escapeHtml(numeroProposta)}</p>
                    </div>
                </div>
                <div></div>
            </div>

            <!-- SEARCH BAR -->
            <div class="search-bar-wrapper">
                <div class="search-bar">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="searchItens" placeholder="Pesquisar itens" oninput="filterItens()">
                    <div class="search-bar-filters" style="margin-left:auto;">
                        <button onclick="adicionarItem()" class="calendar-btn" title="Adicionar item">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button onclick="abrirModalExclusaoLote()" class="calendar-btn" title="Excluir itens por intervalo">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6l-1 14H6L5 6"></path>
                                <path d="M10 11v6M14 11v6"></path>
                                <path d="M9 6V4h6v2"></path>
                            </svg>
                        </button>
                        <button onclick="abrirModalCotacao()" class="calendar-btn" title="Enviar cotação">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                            </svg>
                        </button>
                        <button onclick="syncItens()" class="calendar-btn" title="Sincronizar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                        </button>
                        <button onclick="voltar()" class="calendar-btn" title="Voltar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- TABELA DE ITENS -->
            <div class="card table-card">
                <div style="overflow-x:auto;">
                    <table style="min-width:700px;">
                        <thead>
                            <tr>
                                <th style="width:48px;">ITEM</th>
                                <th style="min-width:140px;">DESCRIÇÃO</th>
                                <th style="width:60px;">QTD</th>
                                <th style="width:54px;">UND</th>
                                <th style="min-width:70px;">MARCA</th>
                                <th style="min-width:80px;">MODELO</th>
                                <th style="min-width:96px;">CUSTO UNT</th>
                                <th style="min-width:96px;">CUSTO TOTAL</th>
                                <th style="min-width:96px;">VENDA UNT</th>
                                <th style="min-width:96px;">VENDA TOTAL</th>
                                <th style="min-width:90px;">FRETE</th>
                                <th style="min-width:100px;">LUCRO BRUTO</th>
                            </tr>
                        </thead>
                        <tbody id="itensContainer">
                            <tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-secondary);">Carregando itens...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TOTAIS -->
            <div class="totals-bar">
                <span><strong>CUSTO TOTAL:</strong> <span id="totalCusto">R$ 0,00</span></span>
                <span><strong>VENDA TOTAL:</strong> <span id="totalVenda">R$ 0,00</span></span>
                <span><strong>TOTAL FRETE:</strong> <span id="totalFrete">R$ 0,00</span></span>
                <span><strong>LUCRO B TOTAL:</strong> <span id="totalLucroBruto">R$ 0,00</span></span>
            </div>
        </div>

        <!-- MODAL: ADICIONAR / EDITAR ITEM -->
        <div class="modal-overlay" id="itemModal">
            <div class="modal-content" style="max-width:900px">
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
                            <div class="form-group"><label>Quantidade *</label><input type="number" step="any" id="itemQuantidade" required onchange="recalcularItemTotais()"></div>
                            <div class="form-group">
                                <label>Unidade</label>
                                <select id="itemUnidade">
                                    <option value="UN">UN</option>
                                    <option value="CX">CX</option>
                                    <option value="MT">MT</option>
                                    <option value="PCT">PCT</option>
                                    <option value="KG">KG</option>
                                    <option value="LT">LT</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Marca</label><input type="text" id="itemMarca"></div>
                            <div class="form-group">
                                <label>Modelo <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:400;">(ou cole um link)</span></label>
                                <input type="text" id="itemModelo" placeholder="Modelo ou https://...">
                            </div>
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
                            <div class="form-group"><label>Lucro Bruto</label><input type="text" id="itemLucroBruto" readonly></div>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="success" onclick="salvarItem()">Salvar</button>
                    <button class="danger" onclick="fecharItemModal()">Cancelar</button>
                </div>
            </div>
        </div>

        <!-- MODAL: COTAÇÃO -->
        <div class="modal-overlay" id="modalCotacaoItens">
            <div class="modal-content" style="max-width:520px">
                <div class="modal-header">
                    <h3 class="modal-title">Enviar Cotação</h3>
                    <button class="close-modal" onclick="fecharModalCotacao()">✕</button>
                </div>
                <div class="form-grid" style="grid-template-columns:1fr;">
                    <div class="form-group">
                        <label>Fornecedor (Marca)</label>
                        <div class="filter-dropdown-inline" style="min-width:unset;">
                            <select id="cotacaoFornecedorSelect">
                                <option value="">Selecione a marca...</option>
                            </select>
                            <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Tipo de envio</label>
                        <div style="display:flex;gap:1rem;padding:0.25rem 0;">
                            <div class="cotacao-tipo-card active" id="cotacaoCardDescricao" onclick="selecionarTipoCotacao('descricao')">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                <span>Descrição</span>
                            </div>
                            <div class="cotacao-tipo-card" id="cotacaoCardModelo" onclick="selecionarTipoCotacao('modelo')">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                                <span>Modelo</span>
                            </div>
                        </div>
                        <input type="hidden" id="cotacaoTipoHidden" value="descricao">
                    </div>
                </div>
                <div class="modal-actions" style="border-top:none;padding-top:0;">
                    <button onclick="enviarCotacao()" id="btnEnviarCotacao" style="background:var(--btn-save);color:white;border:none;">
                        <span id="btnEnviarCotacaoLabel">Enviar</span>
                    </button>
                    <button onclick="fecharModalCotacao()" style="background:var(--btn-delete);color:white;border:none;">Cancelar</button>
                </div>
            </div>
        </div>

        <!-- MODAL: EXCLUSÃO EM LOTE -->
        <div class="modal-overlay" id="modalExclusaoLote">
            <div class="modal-content" style="max-width:440px">
                <div class="modal-header">
                    <h3 class="modal-title">Excluir Itens</h3>
                    <button class="close-modal" onclick="fecharModalExclusaoLote()">✕</button>
                </div>
                <div class="form-group" style="margin-bottom:0.5rem;">
                    <label>Números dos itens a excluir</label>
                    <input type="text" id="inputIntervaloExclusao" placeholder="Ex: 1, 3-5, 7"
                        oninput="document.getElementById('msgErroIntervalo').textContent=''"
                        onkeydown="if(event.key==='Enter') confirmarExclusaoLote()">
                    <p id="msgErroIntervalo" style="font-size:0.85rem;margin-top:6px;font-weight:600;min-height:20px;"></p>
                </div>
                <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;">
                    Use vírgulas para itens separados e hífen para intervalos.<br>
                    Exemplos: <code>1</code> &nbsp;|&nbsp; <code>2-4</code> &nbsp;|&nbsp; <code>1, 3, 5-7</code>
                </p>
                <div class="modal-actions">
                    <button onclick="confirmarExclusaoLote()" style="background:var(--btn-delete);color:white;border:none;min-width:120px;">Excluir</button>
                    <button onclick="fecharModalExclusaoLote()" style="background:var(--btn-edit);color:white;border:none;min-width:120px;">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    tela.style.display = 'block';
}

// ========== CRUD DE ITENS ==========
async function carregarItens(licitacaoId) {
    if (!isOnline) {
        const tbody = document.getElementById('itensContainer');
        if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Sistema offline</td></tr>';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/licitacoes/${licitacaoId}/itens`, { headers: getHeaders() });
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao carregar itens');
        const raw = await res.json();
        itens = raw.map(i => ({
            ...i,
            frete: (i.frete !== null && i.frete !== undefined) ? Number(i.frete) : 0,
            prazo_entrega: i.prazo_entrega ?? i.prazoEntrega ?? ''
        }));
        renderItens();
        atualizarTotais();
    } catch (err) {
        console.error(err);
        showToast('Erro ao carregar itens', 'error');
        const tbody = document.getElementById('itensContainer');
        if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Erro ao carregar itens</td></tr>';
    }
}

function renderItens() {
    const tbody = document.getElementById('itensContainer');
    if (!tbody) return;
    const search = (document.getElementById('searchItens')?.value || '').toLowerCase();
    const filtered = itens.filter(item =>
        (item.descricao || '').toLowerCase().includes(search) ||
        (item.modelo || '').toLowerCase().includes(search)
    );
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Nenhum item cadastrado</td></tr>';
        atualizarTotais();
        return;
    }
    tbody.innerHTML = filtered.map((item, idx) => {
        const modeloValue = item.modelo || '';
        const temLink = isLink(modeloValue);
        const rowClass = (temLink || item.cotado) ? 'row-cotado' : '';

        const modeloCell = temLink
            ? `<a href="${escapeHtml(normalizeUrl(modeloValue))}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="modelo-link-icon">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                       <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                       <polyline points="15 3 21 3 21 9"/>
                       <line x1="10" y1="14" x2="21" y2="3"/>
                   </svg>
               </a>`
            : escapeHtml(modeloValue);

        const custoTotal = parseFloat(item.custo_total) || 0;
        const vendaTotal = parseFloat(item.venda_total) || 0;
        const frete = parseFloat(item.frete) || 0;
        const lucroBruto = vendaTotal - custoTotal - frete;

        return `
        <tr onclick="abrirEdicaoItem('${item.id}')"
            oncontextmenu="onItemContextMenu(event, '${item.id}')"
            style="cursor:pointer;"
            class="${rowClass}">
            <td class="col-num">${item.numero || idx+1}</td>
            <td class="descricao-cell">${escapeHtml(item.descricao || '')}</td>
            <td class="col-num">${item.quantidade || 0}</td>
            <td class="col-num">${escapeHtml(item.unidade || '')}</td>
            <td class="col-short">${escapeHtml(item.marca || '')}</td>
            <td class="col-short">${modeloCell}</td>
            <td class="col-money">${formatMoney(item.custo_unitario)}</td>
            <td class="col-money">${formatMoney(item.custo_total)}</td>
            <td class="col-money">${formatMoney(item.venda_unitario)}</td>
            <td class="col-money">${formatMoney(item.venda_total)}</td>
            <td class="col-money">${formatMoney(frete)}</td>
            <td class="col-money" style="color:${lucroBruto >= 0 ? 'var(--success-color)' : 'var(--btn-delete)'};">${formatMoney(lucroBruto)}</td>
          </tr>`;
    }).join('');
    atualizarTotais();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function atualizarTotais() {
    const totalCusto = itens.reduce((acc, i) => acc + (parseFloat(i.custo_total) || 0), 0);
    const totalVenda = itens.reduce((acc, i) => acc + (parseFloat(i.venda_total) || 0), 0);
    const totalFrete = itens.reduce((acc, i) => acc + (parseFloat(i.frete) || 0), 0);
    const totalLucroBruto = itens.reduce((acc, i) => {
        const venda = parseFloat(i.venda_total) || 0;
        const custo = parseFloat(i.custo_total) || 0;
        const frete = parseFloat(i.frete) || 0;
        return acc + (venda - custo - frete);
    }, 0);

    const elCusto = document.getElementById('totalCusto');
    const elVenda = document.getElementById('totalVenda');
    const elFrete = document.getElementById('totalFrete');
    const elLucro = document.getElementById('totalLucroBruto');
    if (elCusto) elCusto.textContent = formatMoney(totalCusto);
    if (elVenda) elVenda.textContent = formatMoney(totalVenda);
    if (elFrete) elFrete.textContent = formatMoney(totalFrete);
    if (elLucro) {
        elLucro.textContent = formatMoney(totalLucroBruto);
        elLucro.style.color = totalLucroBruto >= 0 ? 'var(--success-color)' : 'var(--btn-delete)';
    }
}

function formatMoney(value) {
    if (value === undefined || value === null || value === '') return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function adicionarItem() {
    editingItemId = null;
    document.getElementById('itemModalTitle').textContent = 'Adicionar Item';
    const proximoNum = itens.length > 0
        ? Math.max(...itens.map(i => i.numero || 0)) + 1
        : 1;
    document.getElementById('itemNumero').value = proximoNum;
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
    switchItemTab('item-tab-geral');
    document.getElementById('itemModal').classList.add('show');
}

function abrirEdicaoItem(itemId) {
    const item = itens.find(i => i.id === itemId);
    if (!item) return;
    editingItemId = item.id;
    document.getElementById('itemModalTitle').textContent = 'Editar Item';
    document.getElementById('itemNumero').value = item.numero || '';
    document.getElementById('itemDescricao').value = item.descricao || '';
    document.getElementById('itemQuantidade').value = item.quantidade || '';
    document.getElementById('itemUnidade').value = item.unidade || 'UN';
    document.getElementById('itemMarca').value = item.marca || '';
    document.getElementById('itemModelo').value = item.modelo || '';
    const prazo = item.prazo_entrega ?? item.prazoEntrega ?? '';
    document.getElementById('itemPrazoEntrega').value = prazo;
    const freteVal = (item.frete !== null && item.frete !== undefined && item.frete !== '') ? Number(item.frete) : '';
    document.getElementById('itemFrete').value = freteVal;
    document.getElementById('itemCustoUnitario').value = (item.custo_unitario !== null && item.custo_unitario !== undefined) ? item.custo_unitario : '';
    document.getElementById('itemVendaUnitario').value = (item.venda_unitario !== null && item.venda_unitario !== undefined) ? item.venda_unitario : '';
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
    const qtd = parseFloat(document.getElementById('itemQuantidade')?.value) || 0;
    const custoUnit = parseFloat(document.getElementById('itemCustoUnitario')?.value) || 0;
    const vendaUnit = parseFloat(document.getElementById('itemVendaUnitario')?.value) || 0;
    const frete = parseFloat(document.getElementById('itemFrete')?.value) || 0;
    const custoTotal = qtd * custoUnit;
    const vendaTotal = qtd * vendaUnit;
    const lucroBruto = vendaTotal - custoTotal - frete;
    const elCT = document.getElementById('itemCustoTotal');
    const elVT = document.getElementById('itemVendaTotal');
    const elLB = document.getElementById('itemLucroBruto');
    if (elCT) elCT.value = formatMoney(custoTotal);
    if (elVT) elVT.value = formatMoney(vendaTotal);
    if (elLB) elLB.value = formatMoney(lucroBruto);
}

async function salvarItem() {
    const qtd = parseFloat(document.getElementById('itemQuantidade').value) || 0;
    const custoUnit = parseFloat(document.getElementById('itemCustoUnitario').value) || 0;
    const vendaUnit = parseFloat(document.getElementById('itemVendaUnitario').value) || 0;
    const frete = parseFloat(document.getElementById('itemFrete').value) || 0;
    const custoTotal = qtd * custoUnit;
    const vendaTotal = qtd * vendaUnit;
    const lucroBruto = vendaTotal - custoTotal - frete;

    const itemData = {
        numero: parseInt(document.getElementById('itemNumero').value),
        descricao: document.getElementById('itemDescricao').value.trim(),
        quantidade: qtd,
        unidade: document.getElementById('itemUnidade').value.trim(),
        marca: document.getElementById('itemMarca').value.trim(),
        modelo: document.getElementById('itemModelo').value.trim(),
        custo_unitario: custoUnit,
        venda_unitario: vendaUnit,
        prazo_entrega: document.getElementById('itemPrazoEntrega').value.trim(),
        frete: frete,
        custo_total: custoTotal,
        venda_total: vendaTotal,
        lucro_bruto: lucroBruto
    };
    if (!itemData.descricao || isNaN(itemData.quantidade) || itemData.quantidade <= 0) {
        showToast('Descrição e quantidade são obrigatórios', 'error');
        return;
    }
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    try {
        let url, method;
        if (editingItemId) {
            url = `${API_URL}/licitacoes/${currentLicitacaoId}/itens/${editingItemId}`;
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
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao salvar item');
        const saved = await res.json();
        const mergedItem = { ...saved, ...itemData, id: saved.id || editingItemId };
        if (method === 'POST') {
            itens.push(mergedItem);
        } else {
            const index = itens.findIndex(i => i.id === (saved.id || editingItemId));
            if (index !== -1) itens[index] = mergedItem;
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
    modal.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const activeBtn = modal.querySelector(`.tab-btn[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const activeContent = document.getElementById(tabId);
    if (activeContent) activeContent.classList.add('active');
}

// ========== MENU DE CONTEXTO (CLIQUE DIREITO) — ITENS ==========
let contextMenuItemId = null;

function onItemContextMenu(e, itemId) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuItemId = itemId;
    const menu = createContextMenu();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 70);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function createContextMenu() {
    const existing = document.getElementById('itemContextMenu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'itemContextMenu';
    menu.innerHTML = `
        <div class="context-menu-item danger" onclick="excluirItemContextMenu()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14H6L5 6"></path>
                <path d="M10 11v6M14 11v6"></path>
                <path d="M9 6V4h6v2"></path>
            </svg>
            Excluir item
        </div>
    `;
    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu, { once: true });
        document.addEventListener('contextmenu', closeContextMenu, { once: true });
    }, 10);
    return menu;
}

function closeContextMenu() {
    const menu = document.getElementById('itemContextMenu');
    if (menu) menu.remove();
    contextMenuItemId = null;
}

async function excluirItemContextMenu() {
    if (!contextMenuItemId) return;
    const id = contextMenuItemId;
    closeContextMenu();
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    const item = itens.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Excluir o item "${item.descricao}"?`)) return;
    try {
        const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (res.status === 401) { sessionStorage.removeItem('licitacoesSession'); mostrarTelaAcessoNegado(); return; }
        if (!res.ok) throw new Error('Erro ao excluir item');
        itens = itens.filter(i => i.id !== id);
        renderItens();
        atualizarTotais();
        showToast('Item excluído', 'error');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ========== EXCLUSÃO EM LOTE ==========
function abrirModalExclusaoLote() {
    const modal = document.getElementById('modalExclusaoLote');
    if (!modal) return;
    const input = document.getElementById('inputIntervaloExclusao');
    const msg = document.getElementById('msgErroIntervalo');
    if (input) input.value = '';
    if (msg) msg.textContent = '';
    modal.classList.add('show');
    setTimeout(() => { if (input) input.focus(); }, 100);
}

function fecharModalExclusaoLote() {
    const modal = document.getElementById('modalExclusaoLote');
    if (modal) modal.classList.remove('show');
}

function parseIntervaloItens(texto) {
    const partes = texto.split(',').map(s => s.trim()).filter(Boolean);
    if (!partes.length) return null;
    const flat = [];
    for (const parte of partes) {
        if (parte.includes('-')) {
            const segmentos = parte.split('-');
            if (segmentos.length !== 2) return null;
            const a = Number(segmentos[0].trim());
            const b = Number(segmentos[1].trim());
            if (isNaN(a) || isNaN(b) || !Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) return null;
            if (a >= b) return null;
            for (let i = a; i <= b; i++) flat.push(i);
        } else {
            const n = Number(parte);
            if (isNaN(n) || !Number.isInteger(n) || n <= 0) return null;
            flat.push(n);
        }
    }
    for (let i = 1; i < flat.length; i++) {
        if (flat[i] <= flat[i - 1]) return null;
    }
    return flat;
}

async function confirmarExclusaoLote() {
    const texto = (document.getElementById('inputIntervaloExclusao')?.value || '').trim();
    const msgEl = document.getElementById('msgErroIntervalo');
    if (!msgEl) return;
    if (!texto) {
        msgEl.style.color = 'var(--btn-delete)';
        msgEl.textContent = 'Informe os números dos itens.';
        return;
    }
    const numeros = parseIntervaloItens(texto);
    if (!numeros || numeros.length === 0) {
        msgEl.style.color = 'var(--btn-delete)';
        msgEl.textContent = 'Os números não respeitam a sequência.';
        return;
    }
    msgEl.textContent = '';
    const itensPraExcluir = itens.filter(i => numeros.includes(Number(i.numero)));
    if (!itensPraExcluir.length) {
        msgEl.style.color = 'var(--btn-delete)';
        msgEl.textContent = 'Nenhum item encontrado com esses números.';
        return;
    }
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    fecharModalExclusaoLote();
    let erros = 0;
    for (const item of itensPraExcluir) {
        try {
            const res = await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/${item.id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (!res.ok) erros++;
            else itens = itens.filter(i => i.id !== item.id);
        } catch { erros++; }
    }
    renderItens();
    atualizarTotais();
    if (erros > 0) {
        showToast(`${erros} item(ns) não puderam ser excluídos`, 'error');
    } else {
        showToast(`${itensPraExcluir.length} item(ns) excluído(s) com sucesso`, 'error');
    }
}

// ========== COTAÇÃO ==========
function saudacao() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
}

function gerarMensagemCotacao(tipo) {
    const linhas = itens
        .filter(item => tipo === 'modelo' ? (item.modelo || item.descricao) : item.descricao)
        .map((item, idx) => {
            const campo = tipo === 'modelo'
                ? (item.modelo || item.descricao || '')
                : (item.descricao || '');
            const unidade = item.unidade ? ` ${item.unidade}` : '';
            return `${idx + 1} - ${campo}\nQuantidade: ${item.quantidade}${unidade}`;
        });
    if (!linhas.length) return '';
    return `${saudacao()}!\nGostaria de pedir, por gentileza, um orçamento para:\n\n${linhas.join('\n\n')}`;
}

function abrirModalCotacao() {
    if (!itens.length) {
        showToast('Nenhum item cadastrado nesta proposta', 'error');
        return;
    }
    const marcasComItens = {};
    for (const item of itens) {
        const marca = (item.marca || '').trim();
        if (!marca) continue;
        if (!marcasComItens[marca]) marcasComItens[marca] = [];
        marcasComItens[marca].push(item);
    }
    const marcasDisponiveisSet = new Set();
    for (const [marca, itensDaMarca] of Object.entries(marcasComItens)) {
        const algumSemLink = itensDaMarca.some(i => !isLink(i.modelo || ''));
        if (algumSemLink) marcasDisponiveisSet.add(marca);
    }
    const marcas = [...marcasDisponiveisSet].sort();
    if (!marcas.length) {
        showToast('Nenhuma marca disponível para cotação (todos os itens possuem link como modelo)', 'error');
        return;
    }
    const select = document.getElementById('cotacaoFornecedorSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a marca...</option>' +
        marcas.map(m => `<option value="${m}">${escapeHtml(m)}</option>`).join('');
    selecionarTipoCotacao('descricao');
    const modal = document.getElementById('modalCotacaoItens');
    if (modal) modal.classList.add('show');
}

function selecionarTipoCotacao(tipo) {
    const hidden = document.getElementById('cotacaoTipoHidden');
    if (hidden) hidden.value = tipo;
    const cardDesc = document.getElementById('cotacaoCardDescricao');
    const cardMod = document.getElementById('cotacaoCardModelo');
    if (cardDesc) cardDesc.classList.toggle('active', tipo === 'descricao');
    if (cardMod) cardMod.classList.toggle('active', tipo === 'modelo');
}

function fecharModalCotacao() {
    const modal = document.getElementById('modalCotacaoItens');
    if (modal) modal.classList.remove('show');
}

async function enviarCotacao() {
    const marcaSelecionada = document.getElementById('cotacaoFornecedorSelect')?.value;
    if (!marcaSelecionada) {
        showToast('Selecione uma marca/fornecedor', 'error');
        return;
    }
    const tipo = document.getElementById('cotacaoTipoHidden')?.value || 'descricao';
    const itensDaMarca = itens.filter(i =>
        (i.marca || '').toLowerCase() === marcaSelecionada.toLowerCase() &&
        !isLink(i.modelo || '')
    );
    const linhas = itensDaMarca
        .filter(item => tipo === 'modelo' ? (item.modelo || item.descricao) : item.descricao)
        .map((item, idx) => {
            const campo = tipo === 'modelo'
                ? (item.modelo || item.descricao || '')
                : (item.descricao || '');
            const unidade = item.unidade ? ` ${item.unidade}` : '';
            return `${idx + 1} - ${campo}\nQuantidade: ${item.quantidade}${unidade}`;
        });
    if (!linhas.length) {
        showToast('Nenhum item com esta marca para cotar', 'error');
        return;
    }
    const mensagem = `${saudacao()}!\nGostaria de pedir, por gentileza, um orçamento para:\n\n${linhas.join('\n\n')}`;
    if (!isOnline) { showToast('Sistema offline', 'error'); return; }
    const btn = document.getElementById('btnEnviarCotacao');
    const label = document.getElementById('btnEnviarCotacaoLabel');
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Buscando...';
    try {
        const res = await fetch(`${API_URL}/fornecedores?search=${encodeURIComponent(marcaSelecionada)}&limit=20`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error('Erro ao buscar fornecedor');
        const resultado = await res.json();
        const lista = Array.isArray(resultado) ? resultado : (resultado.data || []);
        const fornecedor = lista.find(f =>
            f.nome.trim().toLowerCase() === marcaSelecionada.trim().toLowerCase()
        );
        if (!fornecedor) {
            showToast('Fornecedor não encontrado', 'error');
            return;
        }
        const metodo = fornecedor.metodo_envio || 'whatsapp';
        const msgEncoded = encodeURIComponent(mensagem);
        for (const item of itensDaMarca) {
            if (!item.cotado) {
                try {
                    await fetch(`${API_URL}/licitacoes/${currentLicitacaoId}/itens/${item.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...getHeaders() },
                        body: JSON.stringify({ ...item, cotado: true })
                    });
                    item.cotado = true;
                } catch (e) { /* silent */ }
            }
        }
        renderItens();
        if (metodo === 'whatsapp') {
            const celular = (fornecedor.celular || fornecedor.telefone || '').replace(/\D/g, '');
            if (!celular) {
                showToast('Fornecedor sem número de WhatsApp cadastrado', 'error');
                return;
            }
            fecharModalCotacao();
            window.open(`https://wa.me/${celular}?text=${msgEncoded}`, '_blank');
        } else {
            if (!fornecedor.email) {
                showToast('Fornecedor sem e-mail cadastrado', 'error');
                return;
            }
            const proposta = licitacoes.find(l => l.id === currentLicitacaoId);
            const assunto = encodeURIComponent(
                `Solicitação de Orçamento${proposta ? ' - Proposta Nº ' + proposta.numero_proposta : ''}`
            );
            fecharModalCotacao();
            window.location.href = `mailto:${fornecedor.email}?subject=${assunto}&body=${msgEncoded}`;
        }
    } catch (err) {
        showToast(err.message || 'Erro ao enviar cotação', 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (label) label.textContent = 'Enviar';
    }
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
window.abrirEdicaoItem = abrirEdicaoItem;
window.salvarItem = salvarItem;
window.fecharItemModal = fecharItemModal;
window.filterItens = filterItens;
window.syncItens = syncItens;
window.abrirModalCotacao = abrirModalCotacao;
window.fecharModalCotacao = fecharModalCotacao;
window.enviarCotacao = enviarCotacao;
window.selecionarTipoCotacao = selecionarTipoCotacao;
window.switchItemTab = switchItemTab;
window.toggleStatus = toggleStatus;
window.recalcularItemTotais = recalcularItemTotais;
window.onItemContextMenu = onItemContextMenu;
window.excluirItemContextMenu = excluirItemContextMenu;
window.closeContextMenu = closeContextMenu;
window.abrirModalExclusaoLote = abrirModalExclusaoLote;
window.fecharModalExclusaoLote = fecharModalExclusaoLote;
window.confirmarExclusaoLote = confirmarExclusaoLote;
