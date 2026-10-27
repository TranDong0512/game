/* Adapter CapacitorHttp — bypass CORS trong WebView Android. */
function headerGet(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k] || '';
  }
  return '';
}

function toBytes(data) {
  if (data == null) return new Uint8Array(0);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (typeof data === 'string') {
    const clean = data.replace(/[\r\n\s]/g, '');
    if (clean.length > 0 && clean.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(clean)) {
      try {
        const bin = atob(data);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch {
        /* không phải base64 hợp lệ */
      }
    }
    return new TextEncoder().encode(data);
  }
  return new Uint8Array(0);
}

export function createCapHttp(CapacitorHttp) {
  if (!CapacitorHttp) throw new Error('CapacitorHttp không khả dụng');
  return {
    async request(url, opts = {}) {
      const method = (opts.method || 'GET').toUpperCase();
      const req = {
        url,
        method,
        headers: opts.headers || {},
        responseType: 'arraybuffer',
        connectTimeout: opts.timeoutMs || 20000,
        readTimeout: opts.timeoutMs || 20000,
      };
      if (opts.body != null) req.data = opts.body;
      const r = await CapacitorHttp.request(req);
      let raw = r.data;
      let text = null;
      // Native bỏ qua responseType khi Content-Type là application/json
      // → trả object/array đã parse sẵn; chuyển lại thành chuỗi JSON.
      if (raw !== null && typeof raw === 'object' && !(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) {
        text = JSON.stringify(raw);
        raw = null;
      }
      return {
        status: r.status,
        ok: r.status >= 200 && r.status < 300,
        url: r.url || url,
        contentType: headerGet(r.headers, 'content-type'),
        bytes: toBytes(raw),
        text,
      };
    },
  };
}
