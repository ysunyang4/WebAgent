// WebAgent 1.3.1 Extension - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[WebAgent 1.3.1 Extension] Service Worker 启动并就绪');
  chrome.action.setBadgeText({ text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
});

// 后台代理网络请求，彻底绕过网页端 CSP 与跨域限制
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch_bridge') {
    const fetchOptions = {
      method: request.method || 'GET',
      headers: request.headers || {}
    };
    if (request.body !== undefined && request.body !== null) {
      fetchOptions.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    }

    const controller = new AbortController();
    const timeoutMs = request.timeout || 35000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    fetchOptions.signal = controller.signal;

    fetch(request.url, fetchOptions)
      .then(async res => {
        clearTimeout(timeoutId);
        const text = await res.text();
        sendResponse({
          success: true,
          status: res.status,
          statusText: res.statusText,
          responseText: text,
          response: text
        });
      })
      .catch(err => {
        clearTimeout(timeoutId);
        sendResponse({
          success: false,
          error: err.name === 'AbortError' ? 'Request timed out' : err.message
        });
      });
    return true; // 保持通道进行异步回调
  } else if (request.action === 'update_badge') {
    if (request.text !== undefined) {
      chrome.action.setBadgeText({ text: request.text });
    }
    if (request.color) {
      chrome.action.setBadgeBackgroundColor({ color: request.color });
    }
    sendResponse({ success: true });
  }
});
