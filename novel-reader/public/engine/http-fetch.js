/* Adapter fetch — dùng cho test Node và gọi local (không bị CORS). */
export const fetchHttp = {
  async request(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs || 20000),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      status: res.status,
      ok: res.ok,
      url: res.url,
      contentType: res.headers.get('content-type') || '',
      bytes,
      text: null,
    };
  },
};
