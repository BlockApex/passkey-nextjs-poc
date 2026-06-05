/**
 * Smoke test: signed GET /onboarding/usecases against local backend.
 * Run: node scripts/smoke-signed-request.mjs
 */
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pocRoot = join(__dirname, '..');

function loadEnvLocal() {
    const envPath = join(pocRoot, '.env.local');
    if (!existsSync(envPath)) return {};

    const vars = {};
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        vars[key] = value.replace(/\\n/g, '\n');
    }
    return vars;
}

function signCanonical(canonical, privateKeyPem) {
    const signer = crypto.createSign('SHA256');
    signer.update(canonical);
    signer.end();
    return signer.sign(privateKeyPem).toString('hex');
}

const env = loadEnvLocal();
const apiUrl = env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const privateKey = env.NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY || env.NEXT_PUBLIC_PRIVATE_KEY;

if (!privateKey) {
    console.error('Missing NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY in .env.local');
    process.exit(1);
}

const timestamp = Date.now().toString();
const deviceId = 'smoke-test-device';
const deviceType = 'web';
const path = '/onboarding/usecases';
const canonical = `GET|${path}|${timestamp}||${deviceId}|${deviceType}`;
const signature = signCanonical(canonical, privateKey);

const res = await fetch(`${apiUrl}${path}`, {
    headers: {
        'x-signature': signature,
        'x-timestamp': timestamp,
        'x-device-id': deviceId,
        'x-device-type': deviceType,
    },
});

const body = await res.text();
console.log(`GET ${apiUrl}${path}`);
console.log(`Status: ${res.status}`);
console.log(`Body preview: ${body.slice(0, 200)}`);

if (!res.ok) {
    process.exit(1);
}

console.log('Smoke test passed.');
