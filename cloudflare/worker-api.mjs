// Static Worker + Vercel-style API functions (api/*.mjs) and simple rewrites.
import base from './worker.mjs';
import policy from './policy.json';
import * as apis from './api-index.mjs';

function vercelReq(request, url, body) {
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  return { method: request.method, url: url.pathname + url.search, headers, query: Object.fromEntries(url.searchParams), body };
}
function vercelRes() {
  const r = { statusCode: 200, headers: new Headers(), body: null };
  r.setHeader = (k, v) => { r.headers.set(k, String(v)); return r; };
  r.status = c => { r.statusCode = c; return r; };
  r.json = v => { r.headers.set('Content-Type', 'application/json; charset=utf-8'); r.body = JSON.stringify(v); return r; };
  r.send = v => { if (!r.headers.has('Content-Type')) r.headers.set('Content-Type', typeof v === 'string' ? 'text/html; charset=utf-8' : 'application/octet-stream'); r.body = v; return r; };
  r.end = v => { r.body = v ?? null; return r; };
  return r;
}
async function parseBody(request) {
  if (['GET', 'HEAD'].includes(request.method)) return undefined;
  const type = (request.headers.get('content-type') || '').toLowerCase();
  const text = await request.text();
  if (type.includes('application/json')) { try { return JSON.parse(text); } catch { return text; } }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  return text;
}
export default {
  async fetch(request, env, ctx) {
    for (const [k, v] of Object.entries(env)) if (typeof v === 'string') globalThis.process.env[k] = v;
    const url = new URL(request.url);
    const name = url.pathname.replace(/\/$/, '').match(/^\/api\/([A-Za-z0-9_-]+)$/)?.[1];
    const fn = name && apis[name.replace(/-/g, '_')];
    if (fn) {
      const res = vercelRes();
      await fn(vercelReq(request, url, await parseBody(request)), res);
      return new Response(res.body, { status: res.statusCode, headers: res.headers });
    }
    for (const rule of policy.config.rewrites || []) {
      if (rule.source === url.pathname) {
        const u = new URL(rule.destination, url); return base.fetch(new Request(u, request), env, ctx);
      }
    }
    return base.fetch(request, env, ctx);
  }
};
