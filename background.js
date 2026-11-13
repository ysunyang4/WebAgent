// WebAgent 1.3.1 - local MCP bridge proxy
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
});

const TRUSTED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TRUSTED_PORTS = new Set(['18080', '8787', '21888']);

function localBridgeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' && TRUSTED_HOSTS.has(url.hostname) &&
      TRUSTED_PORTS.has(url.port) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || sender.id !== chrome.runtime.id) return false;
  if (request.action === 'fetch_bridge') {
    const url = localBridgeUrl(request.url);
    if (!url) {
      sendResponse({ success: false, error: 'Only approved local MCP endpoints are allowed' });
      return false;
    }
    const method = String(request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      sendResponse({ success: false, error: 'Unsupported method' });
      return false;
    }
    const timeout = Math.max(1000, Math.min(Number(request.timeout) || 35000, 60000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = request.headers && typeof request.headers === 'object' &&
      !Array.isArray(request.headers) ? request.headers : {};
    const options = { method, headers, signal: controller.signal, credentials: 'omit' };
    if (request.body !== undefined && request.body !== null && method === 'POST') {
      options.body = typeof request.body === 'string'
        ? request.body : JSON.stringify(request.body);
    }
    fetch(url.href, options)
      .then(async res => {
        clearTimeout(timer);
        const responseText = await res.text();
        sendResponse({ success: true, status: res.status, statusText: res.statusText,
          responseText, response: responseText });
      })
      .catch(err => {
        clearTimeout(timer);
        sendResponse({ success: false, error: err.name === 'AbortError'
          ? 'Request timed out' : 'Local request failed' });
      });
    return true;
  }
  if (request.action === 'update_badge') {
    if (request.text !== undefined) chrome.action.setBadgeText({ text: String(request.text).slice(0, 4) });
    if (request.color) chrome.action.setBadgeBackgroundColor({ color: request.color });
    sendResponse({ success: true });
  }
  return false;
});
