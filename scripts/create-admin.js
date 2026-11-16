// Crea (o convierte) una cuenta de administración del backoffice.
// Uso en el servidor:  node scripts/create-admin.js email@dominio.com
// Pide la contraseña por teclado. Si el email ya existe, lo marca como admin y cambia su contraseña.
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { promisify } from 'node:util';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('Uso: node scripts/create-admin.js email@dominio.com'); process.exit(1); }

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((res) => {
    rl.stdoutMuted = true;
    rl._writeToOutput = (s) => { if (!rl.stdoutMuted || s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}

const pw = await ask('Contraseña (mín. 8): ');
if (pw.length < 8) { console.error('La contraseña debe tener al menos 8 caracteres'); process.exit(1); }
if ((await ask('Repite la contraseña: ')) !== pw) { console.error('No coinciden'); process.exit(1); }

const salt = crypto.randomBytes(16);
const key = await promisify(crypto.scrypt)(pw, salt, 64);
const hash = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
await db.connect();
const { rows: [u] } = await db.query(`insert into elise_users (email, password_hash, is_admin, full_name)
  values ($1, $2, true, 'Administración')
  on conflict (email) do update set password_hash = excluded.password_hash, is_admin = true, updated_at = now()
  returning email, is_admin`, [email, hash]);
await db.end();
console.log(`✓ ${u.email} ya puede entrar en /admin/`);
