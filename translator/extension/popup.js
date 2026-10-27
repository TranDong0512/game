document.addEventListener('DOMContentLoaded', () => {
  const inputText = document.getElementById('inputText');
  const translateBtn = document.getElementById('translateBtn');
  const result = document.getElementById('result');
  const historyList = document.getElementById('historyList');
  const clearHistory = document.getElementById('clearHistory');
  const vocabList = document.getElementById('vocabList');
  const clearVocab = document.getElementById('clearVocab');
  const exportVocab = document.getElementById('exportVocab');

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
    });
  });

  // Translate button click
  translateBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) return;

    translateBtn.disabled = true;
    translateBtn.innerHTML = `
      <div style="width: 14px; height: 14px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      Đang dịch...
    `;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        sourceLang: 'auto',
        targetLang: 'vi'
      });

      if (response.success) {
        result.innerHTML = `
          <div class="result-label">Bản dịch:</div>
          <div class="result-text">${response.translated}</div>
        `;
        loadHistory();
      } else {
        result.innerHTML = `<div class="error">Lỗi: ${response.error}</div>`;
      }
    } catch (error) {
      result.innerHTML = `<div class="error">Lỗi kết nối. Vui lòng thử lại.</div>`;
    }

    translateBtn.disabled = false;
    translateBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z" fill="white"/>
      </svg>
      Dịch sang tiếng Việt
    `;
  });

  // Ctrl+Enter to translate
  inputText.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      translateBtn.click();
    }
  });

  // Load vocabulary
  async function loadVocabulary() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getVocabulary' });
      const { vocabulary = [] } = response;

      if (vocabulary.length === 0) {
        vocabList.innerHTML = '<div class="empty-state">Chưa có từ vựng nào được lưu</div>';
        return;
      }

      vocabList.innerHTML = vocabulary.map(word => `
        <div class="vocab-item" data-id="${word.id}">
          <div class="vocab-english">${escapeHtml(word.english)}</div>
          <div class="vocab-vietnamese">${escapeHtml(word.vietnamese)}</div>
          ${word.pronunciation ? `<div class="vocab-pronunciation">${escapeHtml(word.pronunciation)}</div>` : ''}
          ${word.meaning ? `<div class="vocab-meaning">${escapeHtml(word.meaning)}</div>` : ''}
          <button class="vocab-delete" data-id="${word.id}" title="Xóa">×</button>
        </div>
      `).join('');

      // Add delete handlers
      document.querySelectorAll('.vocab-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          await chrome.runtime.sendMessage({ action: 'deleteWord', id });
          loadVocabulary();
        });
      });
    } catch (error) {
      vocabList.innerHTML = '<div class="empty-state">Không thể tải danh sách</div>';
    }
  }

  // Export vocabulary to CSV
  exportVocab.addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getVocabulary' });
      const { vocabulary = [] } = response;

      if (vocabulary.length === 0) {
        alert('Không có từ vựng để xuất');
        return;
      }

      const csvHeader = 'English,Vietnamese,Pronunciation,Meaning\n';
      const csvRows = vocabulary.map(w => 
        `"${w.english}","${w.vietnamese}","${w.pronunciation || ''}","${(w.meaning || '').replace(/"/g, '""')}"`
      ).join('\n');
      
      const csv = csvHeader + csvRows;
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `vocabulary_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Lỗi khi xuất file');
    }
  });

  // Clear vocabulary
  clearVocab.addEventListener('click', async () => {
    if (confirm('Xóa tất cả từ vựng?')) {
      await chrome.storage.local.set({ vocabulary: [] });
      loadVocabulary();
    }
  });

  // Load history
  async function loadHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
      const { history = [] } = response;

      if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state">Chưa có lịch sử dịch</div>';
        return;
      }

      historyList.innerHTML = history.slice(0, 20).map(item => `
        <div class="history-item">
          <div class="history-original">${escapeHtml(item.original)}</div>
          <div class="history-arrow">→</div>
          <div class="history-translated">${escapeHtml(item.translated)}</div>
        </div>
      `).join('');
    } catch (error) {
      historyList.innerHTML = '<div class="empty-state">Không thể tải lịch sử</div>';
    }
  }

  // Clear history
  clearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ history: [] });
    loadHistory();
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initial load
  loadHistory();
  loadVocabulary();
});
