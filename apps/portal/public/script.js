const API_URL = window.location.origin + '/api';

/* ── MÓDULOS ── */
const MODULES = [
    { id: 'usuarios',       name: 'Controle de Acesso',    url: 'https://usu-rios.onrender.com',             available: true },
    { id: 'pregões',        name: 'Pregões',               url: 'https://pregoes.onrender.com',              available: true  },
    { id: 'tabela-precos',  name: 'Tabela de Preços',      url: 'https://tabela-precos-udyp.onrender.com',   available: true  },
    { id: 'compra',         name: 'Ordens de Compra',      url: 'https://ordem-compra.onrender.com',         available: true  },
    { id: 'transportadoras',name: 'Transportadoras',       url: 'https://transportadoras.onrender.com',      available: true  },
    { id: 'cotacoes-frete', name: 'Cotações de Frete',     url: 'https://cotacoes-frete-aikc.onrender.com',  available: true  },
    { id: 'faturamento',    name: 'Pedidos de Faturamento',url: 'https://pedido-faturamento.onrender.com',   available: true  },
    { id: 'estoque',        name: 'Estoque',               url: 'https://controle-estoque-0eme.onrender.com',available: true  },
    { id: 'controle-frete', name: 'Controle de Frete',     url: 'https://controle-frete.onrender.com',       available: true  },
    { id: 'receber',        name: 'Contas a Receber',      url: 'https://contas-receber-m1xw.onrender.com',  available: true  },
    { id: 'vendas',         name: 'Vendas',                url: 'https://vendas-qdpf.onrender.com',          available: true  },
    { id: 'vendas-miguel',  name: 'Vendas',                url: 'https://vendas-miguel.onrender.com',        available: true  },
    { id: 'vendas-isaque',  name: 'Vendas',                url: 'https://vendas-isaque.onrender.com',        available: true  },
    { id: 'pagamento',      name: 'Contas a Pagar',        url: 'https://contas-a-pagar-ytr6.onrender.com',  available: true  },
    { id: 'lucro-real',     name: 'Lucro Real',            url: 'https://lucro-real.onrender.com',           available: true  },
    { id: 'financeiro',     name: 'Financeiro',            url: '',                                          available: false },
    { id: 'comercial',      name: 'Comercial',             url: '',                                          available: false }
];

/* ── ÍCONES (igual ao anterior) ── */
const MODULE_ICONS = { /* ... cole o objeto de ícones igual ao anterior ... */ };

let deviceToken        = null;
let publicIP           = null;
let currentSessionInfo = null;
let activeModuleId     = null;
let hoverTimeout       = null;
let sidebarRevealed    = false;

/* ── HELPERS ── */
function getUserPermissions(sessionInfo) {
    if (sessionInfo.is_admin) {
        return MODULES.map(m => m.id); // admin vê todos
    }
    return []; // não-admin não vê nenhum (ajuste conforme necessidade)
}

function getGreeting() {
    const brasiliaTime = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour12: false });
    const hour = new Date(brasiliaTime).getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

function getOrCreateDeviceToken() {
    let token = localStorage.getItem('irDeviceToken');
    if (!token) {
        token = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('irDeviceToken', token);
    }
    return token;
}

async function getPublicIP() {
    try {
        const res = await fetch(`${API_URL}/ip`);
        const data = await res.json();
        return data.ip;
    } catch { return null; }
}

function showMessage(message, type = 'error') {
    const box = document.getElementById('messageBox');
    box.textContent = message;
    box.className = `message ${type} show`;
    setTimeout(() => box.classList.remove('show'), 5000);
}

function togglePassword() {
    const input = document.getElementById('password');
    const btn   = document.querySelector('.toggle-password');
    if (input.type === 'password') { input.type = 'text';     btn.textContent = 'OCULTAR'; }
    else                           { input.type = 'password'; btn.textContent = 'MOSTRAR'; }
}
window.togglePassword = togglePassword;

/* ── LOGOUT ── */
function showLogoutModal()  { document.getElementById('logoutModal').classList.add('show'); }
window.showLogoutModal = showLogoutModal;
function closeLogoutModal() { document.getElementById('logoutModal').classList.remove('show'); }
window.closeLogoutModal = closeLogoutModal;

async function confirmLogout() {
    closeLogoutModal();
    try {
        const si = JSON.parse(sessionStorage.getItem('irUserSession'));
        if (si) {
            await fetch(`${API_URL}/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken: si.sessionToken, deviceToken: si.deviceToken })
            });
        }
    } catch {}
    performLogout();
}
window.confirmLogout = confirmLogout;

function performLogout() {
    sessionStorage.removeItem('irUserSession');
    document.getElementById('dashboardScreen').style.display = 'none';
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('password').value = '';
    document.getElementById('iframesContainer').innerHTML = '';
    sidebarRevealed = false;
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('visible', 'expanded');
    document.getElementById('welcomeScreen').classList.remove('hidden-smooth');
    document.getElementById('logoutFloatingBtn').classList.remove('hidden-smooth');
    const wg = document.getElementById('welcomeGreeting');
    if (wg) wg.textContent = '';
}

/* ── SETUP SIDEBAR HOVER ── */
function setupSidebarHover() {
    const sidebar = document.getElementById('sidebar');
    sidebar.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        if (sidebarRevealed) sidebar.classList.add('expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => sidebar.classList.remove('expanded'), 150);
    });
}

/* ── CARREGAR MÓDULOS NA SIDEBAR ── */
function loadSidebarModules(sessionInfo) {
    const sidebarModules = document.getElementById('sidebarModules');
    sidebarModules.innerHTML = '';
    const perms = getUserPermissions(sessionInfo);
    MODULES.forEach(module => {
        if (!perms.includes(module.id)) return;
        const item = document.createElement('div');
        item.className = 'module-item';
        if (!module.available || !module.url) {
            item.classList.add('disabled');
            item.style.opacity = '0.4';
            item.style.cursor  = 'not-allowed';
        } else {
            item.id = `module-${module.id}`;
            item.setAttribute('data-tooltip', module.name);
            item.addEventListener('click', () => openModule(module));
        }
        const icon = MODULE_ICONS[module.id] || MODULE_ICONS['comercial'];
        const newBadge = module.isNew ? '<span class="badge-new">Novo</span>' : '';
        item.innerHTML = `<span class="module-icon">${icon}</span><span class="module-label">${module.name}${newBadge}</span>`;
        sidebarModules.appendChild(item);
    });
}

/* ── CARREGAR CARDS NA TELA INICIAL ── */
function loadWelcomeModules(sessionInfo) {
    const grid = document.getElementById('welcomeModulesGrid');
    grid.innerHTML = '';
    const perms = getUserPermissions(sessionInfo);
    MODULES.forEach(module => {
        if (!perms.includes(module.id)) return;
        const card = document.createElement('div');
        card.className = 'welcome-module-card';
        const icon = MODULE_ICONS[module.id] || MODULE_ICONS['comercial'];
        const newBadge = module.isNew ? '<span class="badge-new">Novo</span>' : '';
        card.innerHTML = `<span class="card-icon">${icon}</span><span>${module.name}${newBadge}</span>`;
        if (!module.available || !module.url) {
            card.classList.add('unavailable');
        } else {
            card.addEventListener('click', () => openModule(module));
        }
        grid.appendChild(card);
    });
}

/* ── ABRIR MÓDULO ── */
function openModule(module) {
    if (!sidebarRevealed) {
        sidebarRevealed = true;
        document.getElementById('sidebar').classList.add('visible');
        document.getElementById('logoutFloatingBtn').classList.add('hidden-smooth');
    }

    document.querySelectorAll('.module-item').forEach(i => i.classList.remove('active'));
    const sidebarItem = document.getElementById(`module-${module.id}`);
    if (sidebarItem) sidebarItem.classList.add('active');

    document.getElementById('welcomeScreen').classList.add('hidden-smooth');

    let iframeContainer = document.getElementById(`iframe-${module.id}`);
    if (!iframeContainer) {
        const params = new URLSearchParams({ sessionToken: currentSessionInfo.sessionToken });
        iframeContainer = document.createElement('div');
        iframeContainer.className = 'iframe-container';
        iframeContainer.id = `iframe-${module.id}`;

        const loader = document.createElement('div');
        loader.className = 'app-loader';
        loader.innerHTML = '<div class="app-loader-spinner"></div>';
        iframeContainer.appendChild(loader);

        const iframe = document.createElement('iframe');
        iframe.src = `${module.url}?${params}`;
        iframe.title = module.name;
        iframe.addEventListener('load', () => {
            setTimeout(() => {
                loader.classList.add('done');
                setTimeout(() => loader.remove(), 500);
            }, 3000);
        });
        iframeContainer.appendChild(iframe);
        document.getElementById('iframesContainer').appendChild(iframeContainer);
    }

    document.querySelectorAll('.iframe-container').forEach(c => c.classList.remove('active'));
    setTimeout(() => iframeContainer.classList.add('active'), 50);
    activeModuleId = module.id;
}
window.openModule = openModule;

/* ── SHOW DASHBOARD ── */
function showDashboard(sessionInfo) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').style.display = 'block';

    const greeting   = getGreeting();
    const userName   = sessionInfo.name || sessionInfo.username;

    document.getElementById('userInitial').textContent       = userName.charAt(0).toUpperCase();
    document.getElementById('sidebarUserName').textContent   = userName;
    document.getElementById('sidebarUserSector').textContent = ''; // sem setor

    const welcomeGreetingEl = document.getElementById('welcomeGreeting');
    if (welcomeGreetingEl) welcomeGreetingEl.textContent = `${greeting}, ${userName}!`;

    loadSidebarModules(sessionInfo);
    loadWelcomeModules(sessionInfo);
    setupSidebarHover();

    const splash = document.getElementById('splashWelcome');
    if (splash) {
        splash.style.display   = 'flex';
        splash.style.animation = 'none';
        void splash.offsetWidth;
        splash.style.animation = 'fadeOut 0.5s ease 2.5s forwards';
        setTimeout(() => { splash.style.display = 'none'; }, 3000);
    }
}

/* ── LOGIN ── */
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.toLowerCase().trim();
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="btn-spinner"></span> Autenticando...';
    try {
        const res  = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, deviceToken })
        });
        const data = await res.json();
        if (!res.ok) { showMessage(data.message || data.error || 'Erro ao fazer login', 'error'); return; }
        if (data.success && data.session) {
            sessionStorage.setItem('irUserSession', JSON.stringify(data.session));
            currentSessionInfo = data.session;
            showDashboard(data.session);
        }
    } catch { showMessage('Erro ao realizar login. Tente novamente.', 'error'); }
    finally  { loginBtn.disabled = false; loginBtn.innerHTML = 'Acessar Sistema'; }
});

/* ── VERIFY SESSION ── */
async function verifySession(token) {
    try {
        const res  = await fetch(`${API_URL}/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: token })
        });
        const data = await res.json();
        return data.valid === true;
    } catch { return false; }
}

/* ── INIT ── */
async function init() {
    try {
        deviceToken = getOrCreateDeviceToken();
        publicIP    = await getPublicIP();
        const stored = sessionStorage.getItem('irUserSession');
        if (stored) {
            const session = JSON.parse(stored);
            const valid   = await verifySession(session.sessionToken);
            if (valid) { currentSessionInfo = session; showDashboard(session); }
            else sessionStorage.removeItem('irUserSession');
        }
    } catch (e) { console.error('Erro na inicialização:', e); }
}

window.addEventListener('DOMContentLoaded', init);
