const API_URL = window.location.origin + '/api';

async function fetchUsers() {
    const res = await fetch(`${API_URL}/admin/users`);
    const users = await res.json();
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.id.substring(0, 8)}...</td>
            <td>${user.username}</td>
            <td>${user.name}</td>
            <td>${user.is_admin ? 'Sim' : 'Não'}</td>
            <td>${user.is_active ? 'Sim' : 'Não'}</td>
            <td>${user.sector || ''}</td>
            <td>${user.apps || ''}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="editUser('${user.id}')">Editar</button>
                <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openModal(user = null) {
    document.getElementById('userModal').style.display = 'flex';
    if (user) {
        document.getElementById('modalTitle').textContent = 'Editar Usuário';
        document.getElementById('userId').value = user.id;
        document.getElementById('username').value = user.username;
        document.getElementById('name').value = user.name;
        document.getElementById('is_admin').checked = user.is_admin;
        document.getElementById('is_active').checked = user.is_active;
        document.getElementById('sector').value = user.sector || '';
        document.getElementById('apps').value = user.apps || 'precos';
        document.getElementById('password').required = false;
    } else {
        document.getElementById('modalTitle').textContent = 'Novo Usuário';
        document.getElementById('userId').value = '';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('name').value = '';
        document.getElementById('is_admin').checked = false;
        document.getElementById('is_active').checked = true;
        document.getElementById('sector').value = '';
        document.getElementById('apps').value = 'precos';
        document.getElementById('password').required = true;
    }
}

function closeModal() {
    document.getElementById('userModal').style.display = 'none';
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const data = {
        username: document.getElementById('username').value,
        name: document.getElementById('name').value,
        is_admin: document.getElementById('is_admin').checked,
        is_active: document.getElementById('is_active').checked,
        sector: document.getElementById('sector').value || null,
        apps: document.getElementById('apps').value
    };
    const password = document.getElementById('password').value;
    if (password) data.password = password;

    let url = `${API_URL}/admin/users`;
    let method = 'POST';
    if (id) {
        url = `${API_URL}/admin/users/${id}`;
        method = 'PUT';
    }

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        closeModal();
        fetchUsers();
    } else {
        const err = await res.json();
        alert('Erro: ' + err.error);
    }
});

async function editUser(id) {
    const res = await fetch(`${API_URL}/admin/users`);
    const users = await res.json();
    const user = users.find(u => u.id === id);
    if (user) openModal(user);
}

async function deleteUser(id) {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
        const res = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
            fetchUsers();
        } else {
            alert('Erro ao excluir');
        }
    }
}

function logout() {
    sessionStorage.removeItem('irUserSession');
    window.location.href = '/';
}

// Verificar se está logado como admin (opcional, redirecionar se não for)
async function checkAdmin() {
    const stored = sessionStorage.getItem('irUserSession');
    if (!stored) {
        window.location.href = '/';
        return;
    }
    const session = JSON.parse(stored);
    if (!session.is_admin) {
        window.location.href = '/';
        return;
    }
    fetchUsers();
}

checkAdmin();
