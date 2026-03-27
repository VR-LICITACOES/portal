const API_URL = window.location.origin + '/api';

const MODULES = [
    { id: 'licitacoes',      name: 'Licitações',                       url: '/licitacoes',           available: true  },
    { id: 'fornecedores',    name: 'Fornecedores',                     url: '/fornecedores',         available: true  },
    { id: 'precos',          name: 'Tabela de Preços',                 url: '/precos',               available: true  },
    { id: 'compra',          name: 'Controle de Compras',              url: '/compra',               available: false  },
    { id: 'transportadoras', name: 'Transportadoras',                  url: '/transportadoras',      available: false  },
    { id: 'cotacoes',        name: 'Cotações de Frete',                url: '/cotacoes',             available: false  },
    { id: 'pedidos',         name: 'Pedidos de Compra',                url: '/pedidos',              available: false  },
    { id: 'frete',           name: 'Controle de Frete',                url: '/frete',                available: false  },
    { id: 'receber',         name: 'Contas a Receber',                 url: '/receber',              available: false },
    { id: 'resultados',      name: 'Resultados',                       url: '/resultados',           available: false  },
];

/* ── ÍCONES ── */
const MODULE_ICONS = {
    'licitacoes':       '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.381 8.38a 1 1 0 0 1-3.001-3l8.384-8.381"/><path d="m16 16 6-6"/><path d="m21.5 10.5-8-8"/><path d="m8 8 6-6"/><path d="m8.5 7.5 8 8"/></svg>',
    'fornecedores':     '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-handshake-icon lucide-handshake"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>',
    'precos':           '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 13H7"/><path d="M19 9h-4"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="15" y="5" width="4" height="12" rx="1"/><rect x="7" y="8" width="4" height="9" rx="1"/></svg>',
    'compra':           '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    'transportadoras':  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
    'cotacoes':         '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27 22 19"/></svg>',
    'pedidos':          '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/></svg>',
    'estoque':          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    'frete':            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
    'receber':          '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="m16 19 3 3 3-3"/><path d="M18 12h.01"/><path d="M19 16v6"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></svg>', 
    'resultados':       '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-percent-icon lucide-percent"><line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>'
};

let deviceToken        = null;
let publicIP           = null;
let currentSessionInfo = null;
let activeModuleId     = null;
let hoverTimeout       = null;
let sidebarRevealed    = false;

function getUserPermissions(sessionInfo) {
    if (sessionInfo.is_admin) return MODULES.map(m => m.id);
    if (sessionInfo.apps) return sessionInfo.apps.split(',').map(s => s.trim());
    return [];
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

function showLogoutModal()  { document.getElementById('logoutModal').classList.add('show'); }
function closeLogoutModal() { document.getElementById('logoutModal').classList.remove('show'); }
window.showLogoutModal = showLogoutModal;
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

function showDashboard(sessionInfo) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').style.display = 'block';

    const greeting   = getGreeting();
    const userName   = sessionInfo.name || sessionInfo.username;
    const userSector = sessionInfo.sector || '';

    document.getElementById('userInitial').textContent       = userName.charAt(0).toUpperCase();
    document.getElementById('sidebarUserName').textContent   = userName;
    document.getElementById('sidebarUserSector').textContent = userSector;

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
