const WORKER_URL = 'https://broad-hill-edd1.tdong0512.workers.dev';

async function resolve() {
    const input = document.getElementById('url');
    const btn = document.getElementById('btn');
    const result = document.getElementById('result');
    const url = input.value.trim();

    if (!url) return alert('Vui lòng nhập link!');

    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';
    result.className = 'result';
    result.innerHTML = '';

    try {
        const resp = await fetch(`${WORKER_URL}/getlink/tiktok?url=${encodeURIComponent(url)}`, { mode: 'cors' });
        const data = await resp.json();

        result.className = 'result show';
        result.innerHTML = `
            <strong>Short URL:</strong> ${data.shortUrl}<br>
            <strong>Redirect URL:</strong><br>
            <a href="${data.redirectUrl}" target="_blank">${data.redirectUrl}</a><br><br>
            <strong>Product ID:</strong> <span style="color:#e94560;font-size:1.2rem">${data.productId || 'Không tìm thấy'}</span><br><br>
            <pre>${JSON.stringify(data, null, 2)}</pre>
        `;
    } catch (err) {
        result.className = 'result show';
        result.innerHTML = `<span class="error">Lỗi: ${err.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Resolve';
    }
}

document.getElementById('url').addEventListener('keydown', e => {
    if (e.key === 'Enter') resolve();
});
