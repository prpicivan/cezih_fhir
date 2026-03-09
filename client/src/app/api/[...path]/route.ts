/**
 * Catch-all API proxy route — forwards all /api/* requests to backend on port 3010.
 * This is necessary because Next.js Turbopack has issues with next.config.ts rewrites.
 */

const BACKEND = 'http://127.0.0.1:3010';

async function handler(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    const url = new URL(req.url);
    const backendUrl = `${BACKEND}/api/${path.join('/')}${url.search}`;

    const headers = new Headers(req.headers);
    headers.delete('host');

    const body = req.method !== 'GET' && req.method !== 'HEAD'
        ? await req.arrayBuffer()
        : undefined;

    const upstream = await fetch(backendUrl, {
        method: req.method,
        headers,
        body: body ? Buffer.from(body) : undefined,
    });

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('transfer-encoding');

    return new Response(upstream.body, {
        status: upstream.status,
        headers: resHeaders,
    });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
