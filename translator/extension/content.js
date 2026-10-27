// Content script - runs on every page
(function() {
  'use strict';

  let translateIcon = null;
  let saveIcon = null;
  let iconContainer = null;
  let translationPopup = null;
  let selectedText = '';
  let contextValid = true;

  // Check extension context periodically
  function checkContext() {
    try {
      if (chrome?.runtime?.id) {
        contextValid = true;
      } else {
        contextValid = false;
        showReloadBanner();
      }
    } catch(e) {
      contextValid = false;
      showReloadBanner();
    }
  }

  // Show reload banner at top of page
  function showReloadBanner() {
    if (document.getElementById('qt-reload-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'qt-reload-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      cursor: pointer;
    `;
    banner.innerHTML = '🔄 Quick Translate đã được cập nhật. <u>Nhấn để refresh trang</u>';
    banner.addEventListener('click', () => location.reload());
    document.body.appendChild(banner);
  }

  // Check context every 2 seconds
  setInterval(checkContext, 2000);

  // Initial check
  checkContext();

  // Create icon container with translate and save buttons
  function createIconContainer() {
    if (iconContainer) return iconContainer;

    iconContainer = document.createElement('div');
    iconContainer.id = 'quick-translate-icons';
    iconContainer.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: flex;
      gap: 4px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    `;

    // Translate button
    translateIcon = document.createElement('div');
    translateIcon.className = 'qt-icon-btn qt-translate-btn';
    translateIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="white"/>
      </svg>
    `;
    translateIcon.title = 'Dịch đoạn văn này';
    translateIcon.style.cssText = `
      width: 32px;
      height: 32px;
      background: #4285f4;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
    `;
    translateIcon.addEventListener('click', handleTranslateClick);

    // Save button
    saveIcon = document.createElement('div');
    saveIcon.className = 'qt-icon-btn qt-save-btn';
    saveIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" fill="white"/>
      </svg>
    `;
    saveIcon.title = 'Lưu từ vựng';
    saveIcon.style.cssText = `
      width: 32px;
      height: 32px;
      background: #34a853;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
    `;
    saveIcon.addEventListener('click', handleSaveClick);

    // Add hover effects
    const addHover = (btn, color) => {
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'scale(1.1)';
        btn.style.background = color;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
        btn.style.background = color;
      });
    };
    addHover(translateIcon, '#3367d6');
    addHover(saveIcon, '#2d9249');

    iconContainer.appendChild(translateIcon);
    iconContainer.appendChild(saveIcon);
    document.body.appendChild(iconContainer);

    return iconContainer;
  }

  // Create translation popup
  function createTranslationPopup() {
    if (translationPopup) return translationPopup;

    translationPopup = document.createElement('div');
    translationPopup.id = 'quick-translate-popup';
    translationPopup.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      padding: 0;
      width: 420px;
      min-width: 280px;
      height: 450px;
      min-height: 200px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #333;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
    document.body.appendChild(translationPopup);
    return translationPopup;
  }

  // Show translation popup
  function showTranslationPopup(original, translated, x, y) {
    const popup = createTranslationPopup();
    
    // Format text with line breaks preserved
    const formatText = (text) => escapeHtml(text).replace(/\n\n/g, '</p><p style="margin-top: 8px;">').replace(/\n/g, '<br>');
    
    popup.innerHTML = `
      <div id="qt-drag-handle" style="padding: 12px 40px 12px 14px; cursor: move; background: linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius: 12px 12px 0 0; border-bottom: 1px solid #e0e0e0; user-select: none; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#666" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
        <span style="font-size: 12px; color: #666; font-weight: 500;">Quick Translate</span>
      </div>
      <div id="qt-popup-content" style="flex: 1; overflow-y: auto; padding: 14px;">
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; color: #666; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Gốc:</div>
          <div style="color: #555; line-height: 1.6; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 13px;"><p>${formatText(original)}</p></div>
        </div>
        <div>
          <div style="font-size: 11px; color: #4285f4; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Dịch:</div>
          <div style="color: #1a73e8; line-height: 1.6; padding: 12px; background: #e8f0fe; border-radius: 6px; font-weight: 500; font-size: 13px;"><p>${formatText(translated)}</p></div>
        </div>
      </div>
      <div id="qt-close-btn" style="position: absolute; top: 10px; right: 10px; width: 24px; height: 24px; border-radius: 50%; background: #f1f3f4; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; color: #666; transition: background 0.2s;">✕</div>
      <div id="qt-resize-handle" style="position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #aaa 50%); border-radius: 0 0 12px 0;"></div>
    `;

    // Position popup
    let posX = x;
    let posY = y + 40;

    // Keep within viewport
    if (posX + 420 > window.innerWidth) {
      posX = window.innerWidth - 440;
    }
    if (posY + 300 > window.innerHeight) {
      posY = y - 320;
    }
    if (posX < 10) posX = 10;
    if (posY < 10) posY = 10;

    popup.style.left = posX + 'px';
    popup.style.top = posY + 'px';
    popup.style.opacity = '1';
    popup.style.pointerEvents = 'auto';

    // Close button
    document.getElementById('qt-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      hideTranslationPopup();
    });

    // Drag functionality
    const dragHandle = document.getElementById('qt-drag-handle');
    let isDragging = false;
    let dragOffsetX, dragOffsetY;

    const onDragMove = (e) => {
      try {
        if (!isDragging || !document.getElementById('quick-translate-popup')) return;
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;
        
        newX = Math.max(0, Math.min(newX, window.innerWidth - popup.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - popup.offsetHeight));
        
        popup.style.left = newX + 'px';
        popup.style.top = newY + 'px';
      } catch(err) {}
    };

    const onDragEnd = () => {
      try {
        if (isDragging) {
          isDragging = false;
          if (popup) popup.style.transition = 'opacity 0.2s ease';
          document.body.style.userSelect = '';
        }
      } catch(err) {}
    };

    dragHandle.addEventListener('mousedown', (e) => {
      if (e.target.closest('#qt-close-btn')) return;
      isDragging = true;
      dragOffsetX = e.clientX - popup.offsetLeft;
      dragOffsetY = e.clientY - popup.offsetTop;
      popup.style.transition = 'none';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Resize functionality
    const resizeHandle = document.getElementById('qt-resize-handle');
    let isResizing = false;
    let startWidth, startHeight, startX, startY;

    const onResizeMove = (e) => {
      try {
        if (!isResizing || !document.getElementById('quick-translate-popup')) return;
        const newWidth = Math.max(280, startWidth + (e.clientX - startX));
        const newHeight = Math.max(150, startHeight + (e.clientY - startY));
        popup.style.width = newWidth + 'px';
        popup.style.height = newHeight + 'px';
      } catch(err) {}
    };

    const onResizeEnd = () => {
      try {
        if (isResizing) {
          isResizing = false;
          if (popup) popup.style.transition = 'opacity 0.2s ease';
        }
      } catch(err) {}
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startWidth = popup.offsetWidth;
      startHeight = popup.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;
      popup.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);

    // Store cleanup function
    popup._cleanup = () => {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onResizeEnd);
    };

    // Prevent text selection during drag/resize
    popup.addEventListener('selectstart', (e) => {
      try {
        if (e.target.closest('#qt-drag-handle') || e.target.closest('#qt-resize-handle')) {
          e.preventDefault();
        }
      } catch(err) {}
    });
  }

  function hideTranslationPopup() {
    if (translationPopup) {
      try {
        if (translationPopup._cleanup) translationPopup._cleanup();
      } catch(err) {}
      translationPopup.style.opacity = '0';
      translationPopup.style.pointerEvents = 'none';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Handle translate icon click
  function handleTranslateClick(e) {
    e.stopPropagation();

    if (!selectedText) return;

    // Check if extension context is still valid
    if (!contextValid) {
      showReloadBanner();
      return;
    }

    try {
      if (!chrome?.runtime?.id) {
        contextValid = false;
        showReloadBanner();
        return;
      }
    } catch(err) {
      contextValid = false;
      showReloadBanner();
      return;
    }

    // Show loading state
    const container = createIconContainer();
    translateIcon.innerHTML = `
      <div style="width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: qt-spin 0.8s linear infinite;"></div>
    `;

    // Add spinner animation
    if (!document.getElementById('qt-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'qt-spinner-style';
      style.textContent = '@keyframes qt-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    try {
      chrome.runtime.sendMessage(
        { action: 'translate', text: selectedText, sourceLang: 'auto', targetLang: 'vi' },
        (response) => {
          // Restore icon first
          translateIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="white"/>
            </svg>
          `;

          // Check for runtime errors
          if (chrome.runtime.lastError) {
            console.warn('[Content] Runtime error:', chrome.runtime.lastError.message);
            showReloadMessage();
            return;
          }

          if (response && response.success) {
            const rect = container.getBoundingClientRect();
            showTranslationPopup(selectedText, response.translated, rect.left, rect.bottom);
          } else {
            const errorMsg = response?.error || 'Không có phản hồi từ extension';
            console.error('[Content] Translation failed:', errorMsg);
            showTranslationPopup(selectedText, 'Lỗi dịch: ' + errorMsg, e.clientX, e.clientY);
          }
        }
      );
    } catch(err) {
      console.warn('[Content] Send message error:', err.message);
      contextValid = false;
      showReloadBanner();
    }
  }

  // Show reload message
  function showReloadMessage() {
    showTranslationPopup(selectedText, 'Extension vừa được cập nhật. Vui lòng refresh trang (F5) để sử dụng.', 200, 200);
    // Restore icon
    if (translateIcon) {
      translateIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="white"/>
        </svg>
      `;
    }
  }

  // Handle save word click
  function handleSaveClick(e) {
    e.stopPropagation();

    if (!selectedText) return;

    // Check if extension context is still valid
    if (!contextValid) {
      showReloadBanner();
      return;
    }

    try {
      if (!chrome?.runtime?.id) {
        contextValid = false;
        showReloadBanner();
        return;
      }
    } catch(err) {
      contextValid = false;
      showReloadBanner();
      return;
    }

    // Show saving state
    saveIcon.innerHTML = `
      <div style="width: 14px; height: 14px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: qt-spin 0.8s linear infinite;"></div>
    `;

    // Add spinner animation
    if (!document.getElementById('qt-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'qt-spinner-style';
      style.textContent = '@keyframes qt-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    try {
      chrome.runtime.sendMessage(
        { action: 'saveWord', text: selectedText },
        (response) => {
          // Restore icon
          saveIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" fill="white"/></svg>`;

          if (chrome.runtime.lastError) {
            console.warn('[Content] Runtime error:', chrome.runtime.lastError.message);
            contextValid = false;
            showReloadBanner();
            return;
          }

          if (response && response.success) {
            // Show success feedback
            saveIcon.style.background = '#0d904f';
            setTimeout(() => { saveIcon.style.background = '#34a853'; }, 1000);
            
            // Show brief popup
            showTranslationPopup(selectedText, 'Đã lưu từ vựng!', e.clientX, e.clientY);
            setTimeout(hideTranslationPopup, 1500);
          } else {
            alert('Lưu từ thất bại: ' + (response?.error || 'Unknown error'));
          }
        }
      );
    } catch(err) {
      console.warn('[Content] Save error:', err.message);
      contextValid = false;
      showReloadBanner();
    }
  }

  // Listen for selection changes
  document.addEventListener('mouseup', (e) => {
    // Ignore clicks on our own elements
    if (e.target.closest('#quick-translate-icons') || e.target.closest('#quick-translate-popup')) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text && text.length > 0 && text.length < 5000) {
        selectedText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const container = createIconContainer();
        container.style.left = (rect.right + 8) + 'px';
        container.style.top = (rect.top - 4) + 'px';
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
      } else {
        selectedText = '';
        if (iconContainer) {
          iconContainer.style.opacity = '0';
          iconContainer.style.pointerEvents = 'none';
        }
      }
    }, 10);
  });

  // Hide elements when clicking elsewhere
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#quick-translate-icons') && !e.target.closest('#quick-translate-popup')) {
      if (translationPopup) {
        hideTranslationPopup();
      }
    }
  });

  // Update position on scroll (don't hide)
  let scrollTimeout;
  document.addEventListener('scroll', () => {
    // Hide icon during scroll, reposition after
    if (iconContainer) {
      iconContainer.style.opacity = '0';
      iconContainer.style.pointerEvents = 'none';
    }
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      // Reposition icon after scroll stops
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if (text && text.length > 0 && text.length < 5000) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const container = createIconContainer();
          container.style.left = (rect.right + 8) + 'px';
          container.style.top = (rect.top - 4) + 'px';
          container.style.opacity = '1';
          container.style.pointerEvents = 'auto';
        } catch(e) {}
      }
    }, 150);
    
    // Keep popup visible during scroll
    if (translationPopup && translationPopup.style.opacity === '1') {
      translationPopup.style.opacity = '0.9';
      setTimeout(() => {
        if (translationPopup) translationPopup.style.opacity = '1';
      }, 100);
    }
  });

  // Listen for messages from background script (context menu)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showTranslation') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showTranslationPopup(request.original, request.translated, rect.left, rect.bottom);
      }
    }
  });
})();
