/**
 * Backend (Sheets API) + frontend (Vite) sunucularini birlikte baslatir.
 * Kullanim: npm run dev:all
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const procs = [];

function run(name, cmd, args) {
  const p = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: 'inherit' });
  procs.push(p);
  p.on('exit', (code) => {
    console.log('[' + name + '] cikti, kod=' + code);
  });
  return p;
}

run('server', 'node', ['server/index.js']);
run('vite', 'npx', ['vite']);

function shutdown() {
  procs.forEach((p) => {
    try { p.kill(); } catch { /* yoksay */ }
  });
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
