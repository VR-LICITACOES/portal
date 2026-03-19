// create-admin.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function createAdmin() {
  console.log('Criar usuário administrador\n');

  rl.question('Username: ', async (username) => {
    rl.question('Nome: ', async (name) => {
      rl.question('Senha: ', async (password) => {
        const password_hash = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
          .from('users')
          .insert({
            username: username.toLowerCase(),
            name,
            password_hash,
            is_admin: true
          })
          .select();

        if (error) {
          console.error('Erro ao criar usuário:', error.message);
        } else {
          console.log('Usuário admin criado com sucesso:', data[0].username);
        }

        rl.close();
      });
    });
  });
}

createAdmin();
