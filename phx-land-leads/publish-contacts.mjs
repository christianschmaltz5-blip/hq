// Encrypts the private contacts.json with the Keychain passphrase into contacts.enc.json
// (same format as the page's exportEncrypted), then commits and pushes.
// Usage: node phx-land-leads/publish-contacts.mjs [--push]
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.HOME + '/Documents/phx-lead-notes/contacts.json';
const OUT = path.join(dir, 'contacts.enc.json');

const pass = execFileSync('security', ['find-generic-password', '-a', 'hq', '-s', 'hq-contacts', '-w'], { encoding: 'utf8' }).replace(/\n$/, '');
if (!pass) throw new Error('Keychain passphrase is empty');

const plain = fs.readFileSync(SRC, 'utf8');
JSON.parse(plain);

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
const b64 = u => Buffer.from(u).toString('base64');
fs.writeFileSync(OUT, JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
console.log('wrote', OUT, Object.keys(JSON.parse(plain)).length, 'contacts');

if (process.argv.includes('--push')) {
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'inherit' });
  git('add', 'contacts.enc.json');
  git('commit', '-m', 'Update encrypted contacts');
  git('push');
}
