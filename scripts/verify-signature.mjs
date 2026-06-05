/**
 * Verifies PoC signing matches backend RequestSignatureGuard expectations.
 * Run: node scripts/verify-signature.mjs
 */
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pocRoot = join(__dirname, '..');
const backendRoot = join(pocRoot, '..', 'handle-pay-backend');

function loadPem(path) {
    return readFileSync(path, 'utf8').trim();
}

function signCanonical(canonical, privateKeyPem) {
    const signer = crypto.createSign('SHA256');
    signer.update(canonical);
    signer.end();
    return signer.sign(privateKeyPem).toString('hex');
}

function verifyCanonical(canonical, signatureHex, publicKeyPem) {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(canonical);
    verifier.end();
    return verifier.verify(publicKeyPem, Buffer.from(signatureHex, 'hex'));
}

function pemToArrayBuffer(pem) {
    const base64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');
    return Buffer.from(base64, 'base64');
}

function encodeDerInteger(value) {
    let bytes = value;
    if (bytes[0] & 0x80) {
        bytes = Buffer.concat([Buffer.from([0]), bytes]);
    }
    return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
}

function encodeDerSequence(children) {
    const body = Buffer.concat(children);
    return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function rawSignatureToDer(raw) {
    const half = raw.length / 2;
    const r = raw.slice(0, half);
    const s = raw.slice(half);
    return encodeDerSequence([encodeDerInteger(r), encodeDerInteger(s)]);
}

function normalizeSignature(signature) {
    if (signature[0] === 0x30) return signature;
    return rawSignatureToDer(signature);
}

async function signWithWebCrypto(canonical, privateKeyPem) {
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(privateKeyPem),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
    );
    const data = new TextEncoder().encode(canonical);
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        data,
    );
    const normalized = normalizeSignature(Buffer.from(signature));
    return normalized.toString('hex');
}

function resolveKeyPair() {
    const backendPrivate = join(backendRoot, 'keys', 'request-signature-private.pem');
    const backendPublic = join(backendRoot, 'keys', 'request-signature-public.pem');

    if (existsSync(backendPrivate) && existsSync(backendPublic)) {
        return {
            privateKey: loadPem(backendPrivate),
            publicKey: loadPem(backendPublic),
            source: 'handle-pay-backend/keys/',
        };
    }

    const generated = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
        privateKey: generated.privateKey,
        publicKey: generated.publicKey,
        source: 'ephemeral test key pair',
    };
}

const { privateKey, publicKey, source } = resolveKeyPair();
const now = Date.now();
const deviceId = 'device-1';
const deviceType = 'web';

const testCases = [
    `POST|/wallet/all|${now}|{"amount":10}|${deviceId}|${deviceType}`,
    `GET|/wallet/all|${now}||${deviceId}|${deviceType}`,
    `GET|/onboarding/usecases|${now}||${deviceId}|${deviceType}`,
];

console.log(`Using key pair from: ${source}`);

let failed = 0;

for (const canonical of testCases) {
    const nodeSig = signCanonical(canonical, privateKey);
    const webSig = await signWithWebCrypto(canonical, privateKey);

    const nodeOk = verifyCanonical(canonical, nodeSig, publicKey);
    const webOk = verifyCanonical(canonical, webSig, publicKey);

    console.log(`\nCanonical: ${canonical}`);
    console.log(`  Node sign + verify: ${nodeOk ? 'PASS' : 'FAIL'}`);
    console.log(`  WebCrypto sign + verify: ${webOk ? 'PASS' : 'FAIL'}`);

    if (!nodeOk || !webOk) failed += 1;
}

if (failed > 0) {
    console.error(`\n${failed} test case(s) failed`);
    process.exit(1);
}

console.log('\nAll signature verification tests passed.');
