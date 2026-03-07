import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for LazorKit Paymaster (Kora) requests.
 * Solves CORS issues when calling kora.devnet.lazorkit.com from the browser.
 *
 * The LazorKit Paymaster SDK POSTs JSON-RPC requests to the root URL.
 * This route proxies those requests server-side to avoid CORS blocks.
 */

const DEFAULT_PAYMASTER_URL = 'https://kora.devnet.lazorkit.com';

function getPaymasterUrl(): string {
    return process.env.LAZORKIT_PAYMASTER_URL || DEFAULT_PAYMASTER_URL;
}

async function handler(req: NextRequest) {
    try {
        const paymasterUrl = getPaymasterUrl();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const fetchOptions: RequestInit = {
            method: req.method,
            headers,
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            try {
                const body = await req.text();
                if (body) fetchOptions.body = body;
            } catch {
                // No body — proceed without it
            }
        }

        console.log(`[LazorKit Proxy] ${req.method} → ${paymasterUrl}`);

        const response = await fetch(paymasterUrl, fetchOptions);
        const responseBody = await response.text();

        return new NextResponse(responseBody, {
            status: response.status,
            headers: {
                'Content-Type':
                    response.headers.get('Content-Type') || 'application/json',
            },
        });
    } catch (error) {
        console.error('[LazorKit Proxy] Error:', error);
        return NextResponse.json(
            {
                error: 'LazorKit proxy error',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}

export const GET = handler;
export const POST = handler;
