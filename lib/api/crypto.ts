const rawPrivateKey =
    process.env.NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY ||
    process.env.NEXT_PUBLIC_PRIVATE_KEY ||
    '';

function getNormalizedPrivateKey(key: string): string {
    if (!key) return '';

    let normalized = key.replace(/\\n/g, '\n');
    normalized = normalized.replace(/^"|"$/g, '');

    if (
        !normalized.includes('-----BEGIN PRIVATE KEY-----') ||
        !normalized.includes('-----END PRIVATE KEY-----')
    ) {
        console.warn(
            'Crypto Warning: NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY may be malformed or incomplete.',
        );
    }

    return normalized;
}

const PRIVATE_KEY = getNormalizedPrivateKey(rawPrivateKey);

let importedKeyPromise: Promise<CryptoKey> | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
    const base64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function getSigningKey(): Promise<CryptoKey | null> {
    if (!PRIVATE_KEY) {
        console.warn(
            'Crypto Error: NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY is not defined in .env',
        );
        return null;
    }

    if (!importedKeyPromise) {
        importedKeyPromise = crypto.subtle.importKey(
            'pkcs8',
            pemToArrayBuffer(PRIVATE_KEY),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign'],
        );
    }

    return importedKeyPromise;
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function encodeDerInteger(value: Uint8Array): Uint8Array {
    let bytes = value;

    if (bytes[0] & 0x80) {
        bytes = new Uint8Array([0, ...bytes]);
    }

    const encoded = new Uint8Array(2 + bytes.length);
    encoded[0] = 0x02;
    encoded[1] = bytes.length;
    encoded.set(bytes, 2);
    return encoded;
}

function encodeDerSequence(children: Uint8Array[]): Uint8Array {
    const totalLength = children.reduce((sum, child) => sum + child.length, 0);
    const encoded = new Uint8Array(2 + totalLength);
    encoded[0] = 0x30;
    encoded[1] = totalLength;

    let offset = 2;
    for (const child of children) {
        encoded.set(child, offset);
        offset += child.length;
    }

    return encoded;
}

function rawSignatureToDer(raw: Uint8Array): Uint8Array {
    const half = raw.length / 2;
    const r = raw.slice(0, half);
    const s = raw.slice(half);
    return encodeDerSequence([encodeDerInteger(r), encodeDerInteger(s)]);
}

function normalizeSignature(signature: Uint8Array): Uint8Array {
    if (signature[0] === 0x30) {
        return signature;
    }

    return rawSignatureToDer(signature);
}

export function createCanonicalString(
    method: string,
    url: string,
    timestamp: number,
    body: unknown,
    deviceId: string,
    deviceType: string,
): string {
    const stringifiedBody = body ? JSON.stringify(body) : '';
    return `${method.toUpperCase()}|${url}|${timestamp}|${stringifiedBody}|${deviceId}|${deviceType}`;
}

export async function generateSignature(
    canonicalString: string,
): Promise<string> {
    const key = await getSigningKey();
    if (!key) {
        return '';
    }

    try {
        const data = new TextEncoder().encode(canonicalString);
        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            data,
        );
        const normalized = normalizeSignature(new Uint8Array(signature));
        return toHex(normalized);
    } catch (error) {
        console.error('Crypto Error: Failed to generate signature', error);
        return '';
    }
}
