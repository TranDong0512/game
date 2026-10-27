const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const CORS_PROXY = 'https://corsproxy.io/?';

async function translateText(text, sourceLang = 'auto', targetLang = 'vi') {
  // Split text into paragraphs to preserve formatting
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  
  // If short text, translate directly
  if (text.length < 500 || paragraphs.length <= 1) {
    return await translateChunk(text, sourceLang, targetLang);
  }
  
  // Translate each paragraph separately to preserve line breaks
  const translatedParagraphs = [];
  for (const para of paragraphs) {
    const translated = await translateChunk(para.trim(), sourceLang, targetLang);
    translatedParagraphs.push(translated);
  }
  
  return translatedParagraphs.join('\n\n');
}

async function translateChunk(text, sourceLang, targetLang) {
  const limitedText = text.substring(0, 4500);
  
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLang,
    tl: targetLang,
    dt: 't',
    q: limitedText
  });

  const fullUrl = `${GOOGLE_TRANSLATE_URL}?${params.toString()}`;

  try {
    // Try direct call first
    const response = await fetch(fullUrl);
    
    if (!response.ok) {
      throw new Error(`Direct API error: ${response.status}`);
    }
    
    const data = await response.json();

    if (data && data[0]) {
      return data[0].map(item => item[0]).join('');
    }
    throw new Error('Invalid API response');
  } catch (directError) {
    console.warn('[Translator] Direct call failed, trying via CORS proxy...', directError.message);
    
    // Fallback to CORS proxy
    try {
      const proxyResponse = await fetch(CORS_PROXY + encodeURIComponent(fullUrl));
      
      if (!proxyResponse.ok) {
        throw new Error(`Proxy error: ${proxyResponse.status}`);
      }
      
      const data = await proxyResponse.json();

      if (data && data[0]) {
        return data[0].map(item => item[0]).join('');
      }
      throw new Error('Invalid API response from proxy');
    } catch (proxyError) {
      console.error('[Translator] Both methods failed:', proxyError.message);
      throw new Error('Không thể kết nối đến dịch vụ dịch. Vui lòng thử lại sau.');
    }
  }
}

// Single message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'translate') {
    translateText(request.text, request.sourceLang, request.targetLang)
      .then(translated => {
        saveToHistory(request.text, translated, sender.tab?.url);
        sendResponse({ success: true, translated });
      })
      .catch(error => {
        console.error('[Translator] Translation error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'saveWord') {
    saveWord(request.text)
      .then(wordData => {
        sendResponse({ success: true, word: wordData });
      })
      .catch(error => {
        console.error('[Translator] Save word error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'getVocabulary') {
    chrome.storage.local.get('vocabulary').then(({ vocabulary = [] }) => {
      sendResponse({ vocabulary });
    });
    return true;
  }

  if (request.action === 'deleteWord') {
    deleteWord(request.id).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'getHistory') {
    chrome.storage.local.get('history').then(({ history = [] }) => {
      sendResponse({ history });
    });
    return true;
  }
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: 'Dịch "%s" sang tiếng Việt',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-selection') {
    translateText(info.selectionText)
      .then(translated => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showTranslation',
          original: info.selectionText,
          translated: translated
        });
      })
      .catch(error => {
        console.error('[Translator] Context menu error:', error);
      });
  }
});

// Save history
async function saveToHistory(original, translated, pageUrl) {
  const { history = [] } = await chrome.storage.local.get('history');
  history.unshift({
    original: original.substring(0, 100),
    translated: translated.substring(0, 100),
    url: pageUrl,
    timestamp: Date.now()
  });
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ history });
}

// Save word to vocabulary
async function saveWord(text) {
  const word = text.trim();
  const wordLower = word.toLowerCase();
  
  // Run translation and dictionary lookup in parallel
  const translatePromise = translateChunk(wordLower, 'auto', 'vi');
  
  // Dictionary API with timeout
  const dictPromise = Promise.race([
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(wordLower)}`)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), 2000)) // 2s timeout
  ]);

  // Wait for translation first (most important)
  const translated = await translatePromise;
  
  // Get dictionary result (optional, don't wait too long)
  let pronunciation = '';
  let meaning = '';
  
  try {
    const dictData = await dictPromise;
    if (dictData && dictData[0]) {
      pronunciation = dictData[0].phonetic || dictData[0].phonetics?.[0]?.text || '';
      if (dictData[0].meanings && dictData[0].meanings[0]) {
        meaning = dictData[0].meanings[0].definitions[0]?.definition || '';
      }
    }
  } catch (e) {
    // Dictionary lookup failed, that's ok
  }

  const wordData = {
    id: Date.now(),
    english: word,
    vietnamese: translated,
    pronunciation: pronunciation,
    meaning: meaning,
    timestamp: Date.now()
  };

  // Save to vocabulary
  const { vocabulary = [] } = await chrome.storage.local.get('vocabulary');
  
  // Check for duplicates
  const existingIndex = vocabulary.findIndex(v => v.english.toLowerCase() === wordLower);
  if (existingIndex >= 0) {
    vocabulary[existingIndex] = wordData;
  } else {
    vocabulary.unshift(wordData);
  }
  
  // Keep max 200 words
  if (vocabulary.length > 200) vocabulary.length = 200;
  
  await chrome.storage.local.set({ vocabulary });
  return wordData;
}

// Delete word from vocabulary
async function deleteWord(id) {
  const { vocabulary = [] } = await chrome.storage.local.get('vocabulary');
  const filtered = vocabulary.filter(v => v.id !== id);
  await chrome.storage.local.set({ vocabulary: filtered });
}
