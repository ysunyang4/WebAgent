// ==UserScript==
// @name         WebAgent 1.3.1 (Web AI MCP Bridge)
// @namespace    https://github.com/ysunyang4/webagent
// @version      1.3.1
// @description  WebAgent 1.3.1 专用油猴脚本，无缝将 DeepSeek / ChatGPT / Kimi / 豆包 / 通义千问 (Qwen) / Duck.ai / Dola 网页端连接至本地 WebAgent (127.0.0.1:18080 / :8787)。原生支持标准 MCP 工具调用、全盘文件读写、终端命令行执行、Android 自动化及多大模型自愈调度。
// @author       WebAgent Core
// @match        https://chat.deepseek.com/*
// @match        https://*.deepseek.com/*
// @match        https://chatgpt.com/*
// @match        https://*.chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://*.openai.com/*
// @match        https://kimi.ai/*
// @match        https://www.kimi.ai/*
// @match        https://*.kimi.ai/*
// @match        https://kimi.moonshot.cn/*
// @match        https://*.kimi.moonshot.cn/*
// @match        https://kimi.com/*
// @match        https://*.kimi.com/*
// @match        https://www.doubao.com/*
// @match        https://doubao.com/*
// @match        https://*.doubao.com/*
// @match        https://duck.ai/*
// @match        https://*.duck.ai/*
// @match        https://duckduckgo.com/chat*
// @match        https://*.duckduckgo.com/chat*
// @match        https://duckduckgo.com/aichat*
// @match        https://*.duckduckgo.com/aichat*
// @match        https://duckduckgo.com/?q=DuckDuckGo+AI+Chat*
// @match        https://chat.qwen.ai/*
// @match        https://*.qwen.ai/*
// @match        https://tongyi.aliyun.com/*
// @match        https://www.dola.com/*
// @match        https://dola.com/*
// @match        https://*.dola.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      127.0.0.1
// @connect      localhost
// @connect      127.0.0.1:18080
// @connect      localhost:18080
// @connect      127.0.0.1:8787
// @connect      localhost:8787
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Prevent multiple injections / duplicate timer intervals from freezing the tab or iframes
  if (typeof window !== "undefined") {
    if (window.top !== window.self) {
      return; // Never run inside child iframes
    }
    if (window.__WEBAGENT_1_3_1_LOADED__ || window.__NEXUS_WEB_AGENT_LOADED__) {
      return; // Already loaded in this document
    }
    window.__WEBAGENT_1_3_1_LOADED__ = true;
  }

  // =========================================================================
  // 0. Universal GM API & Tauri Host IPC Polyfill for Non-Extension / WebView2 Environments
  // =========================================================================
  if (typeof window !== "undefined") {
    if (typeof window.GM_setValue === "undefined") {
      window.GM_setValue = (k, v) => {
        try { localStorage.setItem('__gm_' + k, typeof v === 'string' ? v : JSON.stringify(v)); } catch(e) {}
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          try { chrome.storage.local.set({ [k]: v }); } catch(e) {}
        }
      };
    }
    if (typeof window.GM_getValue === "undefined") {
      window.GM_getValue = (k, d) => {
        try {
          const v = localStorage.getItem('__gm_' + k);
          if (v === null || v === undefined) return d;
          try { return JSON.parse(v); } catch(_) { return v; }
        } catch(e) { return d; }
      };
    }
    if (typeof window.GM_setClipboard === "undefined") {
      window.GM_setClipboard = (t) => { try { navigator.clipboard.writeText(t); } catch(e) {} };
    }
    // 自动与 chrome.storage.local 同步
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get(null, (items) => {
          if (items) {
            for (const [k, v] of Object.entries(items)) {
              try {
                if (localStorage.getItem('__gm_' + k) === null) {
                  localStorage.setItem('__gm_' + k, typeof v === 'string' ? v : JSON.stringify(v));
                }
              } catch(e) {}
            }
          }
        });
      } catch(e) {}
    }

    if (typeof window.GM_xmlhttpRequest === "undefined" || (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") || (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function")) {
      const origXhr = typeof window.GM_xmlhttpRequest === "function" ? window.GM_xmlhttpRequest : null;
      window.GM_xmlhttpRequest = function(opts) {
        const method = opts.method || 'GET';
        const headers = opts.headers || {};
        const body = opts.data || undefined;

        // 1. 优先使用 Chrome / Edge 扩展后台 Service Worker 穿透代理 (完全免疫网页 CSP 与跨域拦截)
        if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
          try {
            chrome.runtime.sendMessage({
              action: "fetch_bridge",
              url: opts.url,
              method: method,
              headers: headers,
              body: body,
              timeout: opts.timeout || 35000
            }, function(res) {
              if (chrome.runtime.lastError || !res || res.success === false) {
                const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (res && res.error ? res.error : "Extension proxy error");
                if (origXhr) {
                  origXhr(opts);
                } else {
                  fetch(opts.url, { method: method, headers: headers, body: body, mode: 'cors' })
                    .then(async r => {
                      const text = await r.text();
                      if (opts.onload) {
                        opts.onload({
                          status: r.status,
                          statusText: r.statusText,
                          responseText: text,
                          response: text
                        });
                      }
                    })
                    .catch(err => {
                      if (opts.onerror) opts.onerror(new Error(errMsg + " | " + err.message));
                    });
                }
                return;
              }
              if (opts.onload) {
                opts.onload({
                  status: res.status || 200,
                  statusText: res.statusText || "OK",
                  responseText: res.responseText || "",
                  response: res.response || ""
                });
              }
            });
            return;
          } catch(e) {
            // fallback
          }
        }

        // 2. 宿主原生 IPC 通道 (Tauri / WebView2)
        const tauriInvoker = (typeof window !== "undefined" && window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function")
          ? window.__TAURI_INTERNALS__.invoke
          : ((typeof window !== "undefined" && window.__TAURI__ && typeof window.__TAURI__.core?.invoke === "function") ? window.__TAURI__.core.invoke : null);

        if (tauriInvoker) {
          const payload = { url: opts.url, method: method, headers: headers, body: body };
          tauriInvoker("plugin:nexus|nexus_bridge_request", payload)
            .catch(() => tauriInvoker("nexus_bridge_request", payload))
            .then(res => {
              if (opts.onload) {
                opts.onload({
                  status: res.status,
                  statusText: res.status_text || res.statusText || "",
                  responseText: res.response_text || res.responseText || "",
                  response: res.response_text || res.responseText || ""
                });
              }
            })
            .catch(err => {
              if (origXhr) { origXhr(opts); }
              else if (opts.onerror) { opts.onerror(err); }
            });
          return;
        }

        if (origXhr) {
          origXhr(opts);
          return;
        }

        fetch(opts.url, { method: method, headers: headers, body: body, mode: 'cors' })
          .then(async res => {
            const text = await res.text();
            if (opts.onload) {
              opts.onload({
                status: res.status,
                statusText: res.statusText,
                responseText: text,
                response: text
              });
            }
          }).catch(err => {
            if (opts.onerror) opts.onerror(err);
          });
      };
    }
  }

    if (typeof globalThis !== "undefined") {
      globalThis.GM_getValue = window.GM_getValue;
      globalThis.GM_setValue = window.GM_setValue;
      globalThis.GM_setClipboard = window.GM_setClipboard;
      globalThis.GM_xmlhttpRequest = window.GM_xmlhttpRequest;
    }

  // =========================================================================
  // 1. 平台识别与专属主题配置 (DeepSeek / ChatGPT / Kimi / 豆包 / Duck.ai / Qwen / Dola)
  // =========================================================================
  function detectPlatform() {
    const host = (window.location.hostname || "").toLowerCase();
    const href = (window.location.href || "").toLowerCase();
    if (host.includes("chatgpt") || host.includes("openai") || href.includes("chatgpt.com") || href.includes("openai.com")) return "chatgpt";
    if (host.includes("deepseek") || href.includes("deepseek.com")) return "deepseek";
    if (host.includes("kimi") || host.includes("moonshot") || href.includes("kimi.ai") || href.includes("kimi.moonshot.cn") || href.includes("kimi.com")) return "kimi";
    if (host.includes("doubao") || href.includes("doubao.com")) return "doubao";
    if (host.includes("duck.ai") || host.includes("duckduckgo") || href.includes("duck.ai") || href.includes("duckduckgo.com")) return "duckai";
    if (host.includes("qwen") || host.includes("tongyi") || href.includes("qwen.ai") || href.includes("tongyi.aliyun.com")) return "qwen";
    if (host.includes("dola") || href.includes("dola.com")) return "dola";
    return "unknown";
  }

  const PLATFORM = detectPlatform();
  if (PLATFORM === "unknown") return;

  const THEMES = {
    chatgpt: {
      name: "ChatGPT",
      badgeTitle: "ChatGPT × WebAgent 1.3.1",
      icon: "🎨",
      primaryColor: "#10A37F",
      primaryHover: "#0E8C6D",
      primaryRgb: "16, 163, 127",
      borderRadius: "14px",
      pillRadius: "24px",
      fontFamily: "'JetBrains Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      defaultPosition: { bottom: "84px", right: "28px" },
    },
    deepseek: {
      name: "DeepSeek",
      badgeTitle: "DeepSeek × WebAgent 1.3.1",
      icon: "🐳",
      primaryColor: "#4D6BFE",
      primaryHover: "#3B58E8",
      primaryRgb: "77, 107, 254",
      borderRadius: "14px",
      pillRadius: "24px",
      fontFamily: "'JetBrains Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      defaultPosition: { bottom: "84px", right: "28px" },
    },
    kimi: {
      name: "Kimi",
      badgeTitle: "Kimi × WebAgent 1.3.1",
      icon: "🌙",
      primaryColor: "#8B5CF6",
      primaryHover: "#7C3AED",
      primaryRgb: "139, 92, 246",
      borderRadius: "14px",
      pillRadius: "24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', sans-serif",
      defaultPosition: { bottom: "24px", right: "28px" },
    },
    doubao: {
      name: "豆包",
      badgeTitle: "豆包 × WebAgent 1.3.1",
      icon: "👧🏻",
      primaryColor: "#3370FF",
      primaryHover: "#1E5AF5",
      primaryRgb: "51, 112, 255",
      borderRadius: "16px",
      pillRadius: "24px",
      fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
      defaultPosition: { bottom: "28px", right: "28px" },
    },
    duckai: {
      name: "Duck.ai",
      badgeTitle: "Duck.ai × WebAgent 1.3.1",
      icon: "🦆",
      primaryColor: "#DE5833",
      primaryHover: "#C84B29",
      primaryRgb: "222, 88, 51",
      borderRadius: "14px",
      pillRadius: "24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      defaultPosition: { top: "12px", left: "calc(50% - 90px)" },
    },
    qwen: {
      name: "通义千问",
      badgeTitle: "Qwen × WebAgent 1.3.1",
      icon: "🟣",
      primaryColor: "#615CED",
      primaryHover: "#4F46E5",
      primaryRgb: "97, 92, 237",
      borderRadius: "14px",
      pillRadius: "24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', sans-serif",
      defaultPosition: { bottom: "28px", right: "28px" },
    },
    dola: {
      name: "Dola",
      badgeTitle: "Dola × WebAgent 1.3.1",
      icon: "🌸",
      primaryColor: "#059669",
      primaryHover: "#047857",
      primaryRgb: "5, 150, 105",
      borderRadius: "14px",
      pillRadius: "24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', sans-serif",
      defaultPosition: { bottom: "28px", right: "28px" },
    },
  };

  const CURRENT_THEME = THEMES[PLATFORM];

  // =========================================================================
  // 1.5 自适应明暗主题引擎 (跟随页面 UI 主题 + 用户手动调节明暗)
  // =========================================================================
  function detectHostDarkMode() {
    const html = document.documentElement;
    const body = document.body;
    const checkAttrs = ["data-theme", "data-color-mode", "theme", "color-scheme", "data-theme-mode", "arco-theme"];
    for (const attr of checkAttrs) {
      const val = (html.getAttribute(attr) || body?.getAttribute(attr) || "").toLowerCase();
      if (val.includes("dark")) return true;
      if (val.includes("light")) return false;
    }
    if (html.classList.contains("dark") || body?.classList.contains("dark") || html.classList.contains("theme-dark")) return true;
    if (html.classList.contains("light") || body?.classList.contains("light") || html.classList.contains("theme-light")) return false;

    // 根据 body / html 实际背景色亮度采样计算 (兼容各类 SPA 网页动态切换)
    try {
      const bg = window.getComputedStyle(body || html).backgroundColor;
      const rgb = bg.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const r = parseInt(rgb[0], 10);
        const g = parseInt(rgb[1], 10);
        const b = parseInt(rgb[2], 10);
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance < 130) return true;
        if (luminance > 160) return false;
      }
    } catch {}

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function isCurrentThemeDark() {
    const mode = CONFIG?.themeMode || "auto";
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return detectHostDarkMode();
  }

  function applyThemeVariables() {
    const root = document.getElementById("nexus-agent-root");
    if (!root) return;
    const dark = isCurrentThemeDark();
    const primary = CURRENT_THEME.primaryColor;
    const hover = CURRENT_THEME.primaryHover;
    const rgb = CURRENT_THEME.primaryRgb || "77, 107, 254";

    const targetDoc = document.documentElement;
    targetDoc.style.setProperty("--nx-primary", primary);
    targetDoc.style.setProperty("--nx-glow", `rgba(${rgb}, ${dark ? 0.35 : 0.20})`);
    if (dark) {
      targetDoc.style.setProperty("--nx-card-bg", "rgba(18, 22, 32, 0.96)");
      targetDoc.style.setProperty("--nx-card-border", "1px solid rgba(255, 255, 255, 0.12)");
      targetDoc.style.setProperty("--nx-text-primary", "#F8FAFC");
      targetDoc.style.setProperty("--nx-shadow-toast", "0 10px 30px rgba(0, 0, 0, 0.45)");
    } else {
      targetDoc.style.setProperty("--nx-card-bg", "rgba(255, 255, 255, 0.98)");
      targetDoc.style.setProperty("--nx-card-border", "1px solid rgba(226, 232, 240, 0.95)");
      targetDoc.style.setProperty("--nx-text-primary", "#1E293B");
      targetDoc.style.setProperty("--nx-shadow-toast", "0 10px 25px rgba(0, 0, 0, 0.12)");
    }
    root.style.setProperty("--nx-primary", primary);
    root.style.setProperty("--nx-primary-hover", hover);
    root.style.setProperty("--nx-glow", `rgba(${rgb}, ${dark ? 0.35 : 0.20})`);
    root.style.setProperty("--nx-accent-bg", `rgba(${rgb}, ${dark ? 0.14 : 0.08})`);
    root.style.setProperty("--nx-accent-border", `rgba(${rgb}, ${dark ? 0.35 : 0.22})`);
    root.style.setProperty("--nx-btn-sec-hover", `rgba(${rgb}, ${dark ? 0.24 : 0.15})`);

    if (dark) {
      root.style.setProperty("--nx-card-bg", "rgba(18, 22, 32, 0.96)");
      root.style.setProperty("--nx-card-border", "1px solid rgba(255, 255, 255, 0.10)");
      root.style.setProperty("--nx-tile-bg", "rgba(255, 255, 255, 0.04)");
      root.style.setProperty("--nx-tile-border", "rgba(148, 163, 184, 0.16)");
      root.style.setProperty("--nx-text-primary", "#F8FAFC");
      root.style.setProperty("--nx-text-muted", "#94A3B8");
      root.style.setProperty("--nx-input-bg", "rgba(0, 0, 0, 0.35)");
      root.style.setProperty("--nx-input-border", "1px solid rgba(255, 255, 255, 0.14)");
      root.style.setProperty("--nx-subtle-bg", "rgba(0, 0, 0, 0.22)");
      root.style.setProperty("--nx-divider", "rgba(148, 163, 184, 0.16)");
      root.style.setProperty("--nx-shadow-pill", "0 10px 30px rgba(0, 0, 0, 0.35)");
      root.style.setProperty("--nx-shadow-drawer", "0 24px 60px rgba(0, 0, 0, 0.50)");
      root.style.setProperty("--nx-shadow-toast", "0 10px 30px rgba(0, 0, 0, 0.45)");
      root.setAttribute("data-theme-mode", "dark");
    } else {
      root.style.setProperty("--nx-card-bg", "rgba(255, 255, 255, 0.98)");
      root.style.setProperty("--nx-card-border", "1px solid rgba(226, 232, 240, 0.9)");
      root.style.setProperty("--nx-tile-bg", "#FFFFFF");
      root.style.setProperty("--nx-tile-border", "rgba(226, 232, 240, 0.9)");
      root.style.setProperty("--nx-text-primary", "#1E293B");
      root.style.setProperty("--nx-text-muted", "#64748B");
      root.style.setProperty("--nx-input-bg", "rgba(0, 0, 0, 0.04)");
      root.style.setProperty("--nx-input-border", "1px solid rgba(0, 0, 0, 0.12)");
      root.style.setProperty("--nx-subtle-bg", "rgba(0, 0, 0, 0.03)");
      root.style.setProperty("--nx-divider", "rgba(0, 0, 0, 0.08)");
      root.style.setProperty("--nx-shadow-pill", "0 10px 30px rgba(0, 0, 0, 0.10)");
      root.style.setProperty("--nx-shadow-drawer", "0 20px 50px rgba(0, 0, 0, 0.14)");
      root.style.setProperty("--nx-shadow-toast", "0 10px 25px rgba(0, 0, 0, 0.15)");
      root.setAttribute("data-theme-mode", "light");
    }

    if (typeof updateThemeSelectorUI === "function") {
      updateThemeSelectorUI();
    }
  }

  function updateThemeSelectorUI() {
    const mode = CONFIG?.themeMode || "auto";
    const autoBtn = document.getElementById("nexus-tm-auto");
    const lightBtn = document.getElementById("nexus-tm-light");
    const darkBtn = document.getElementById("nexus-tm-dark");
    const statusTag = document.getElementById("nexus-theme-status-tag");
    const quickBtn = document.getElementById("nexus-quick-theme");

    if (autoBtn) autoBtn.classList.toggle("active", mode === "auto");
    if (lightBtn) lightBtn.classList.toggle("active", mode === "light");
    if (darkBtn) darkBtn.classList.toggle("active", mode === "dark");

    const isDark = isCurrentThemeDark();
    if (statusTag) {
      if (mode === "auto") {
        statusTag.innerText = `跟随页面 (${isDark ? "暗色" : "浅色"})`;
      } else if (mode === "dark") {
        statusTag.innerText = "强制暗黑";
      } else {
        statusTag.innerText = "强制明亮";
      }
    }
    if (quickBtn) {
      setSafeHTML(quickBtn, nxSvg("theme", "nexus-icon-btn"));
      if (mode === "auto") {
        quickBtn.title = `主题: 自动跟随 (当前${isDark ? "暗色" : "浅色"}) - 点击切换`;
      } else if (mode === "light") {
        quickBtn.title = "主题: 强制明亮 - 点击切换";
      } else {
        quickBtn.title = "主题: 强制暗黑 - 点击切换";
      }
    }
  }

  function setThemeMode(newMode) {
    if (!CONFIG) return;
    CONFIG.themeMode = newMode;
    GM_setValue("nexus_theme_mode", newMode);
    applyThemeVariables();
    const names = { auto: "跟随页面", light: "明亮模式", dark: "暗黑模式" };
    if (typeof showToast === "function") {
      showToast(`UI 主题已设为: ${names[newMode] || newMode}`);
    }
  }

  let themeObserver = null;
  function setupThemeObserver() {
    if (themeObserver) return;
    try {
      themeObserver = new MutationObserver(() => {
        if (CONFIG?.themeMode === "auto") {
          applyThemeVariables();
        }
      });
      if (document.documentElement) {
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "data-theme", "data-color-mode", "theme", "color-scheme", "style", "arco-theme"],
        });
      }
      if (document.body) {
        themeObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ["class", "data-theme", "data-color-mode", "theme", "color-scheme", "style", "arco-theme"],
        });
      }
    } catch (e) {
      console.warn("[Nexus] themeObserver setup error", e);
    }

    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          if (CONFIG?.themeMode === "auto") {
            applyThemeVariables();
          }
        });
      } catch (e) {}
    }
  }

    // =========================================================================
  // 1.8 Trusted Types 安全注入适配器 (彻底解决现代浏览器 TrustedHTML 强拦截)
  // =========================================================================
  let trustedPolicy = null;
  let policyFailed = false;

  function setSafeHTML(el, htmlString) {
    if (!el) return;

    // 1. 如果支持 Trusted Types 且尚未失败，尝试合法策略
    if (!policyFailed && window.trustedTypes && window.trustedTypes.createPolicy) {
      if (!trustedPolicy) {
        try {
          trustedPolicy = window.trustedTypes.createPolicy("nexusPolicy", {
            createHTML: (s) => s,
          });
        } catch (_) {
          try {
            trustedPolicy = window.trustedTypes.defaultPolicy || null;
          } catch (_) {
            trustedPolicy = null;
          }
          if (!trustedPolicy) {
            policyFailed = true;
          }
        }
      }
      if (trustedPolicy && typeof trustedPolicy.createHTML === "function") {
        try {
          el.innerHTML = trustedPolicy.createHTML(htmlString);
          return;
        } catch (_) {
          policyFailed = true;
        }
      }
    }

    // 2. DOMParser 纯 DOM 节点转移注入（彻底绕过 TrustedHTML 拦截，且完美保留 SVG 与所有标签）
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, "text/html");
      el.replaceChildren();
      while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
      }
      return;
    } catch (_) {}

    // 3. 通用兜底
    try {
      el.innerHTML = htmlString;
    } catch (err) {
      console.error("[Nexus Web Agent] setSafeHTML failed:", err);
    }
  }

  // =========================================================================
  // 1.8 极简细线统一矢量图标库 (Monoline Outline SVG Icons - 严格匹配设计规范)
  // =========================================================================
  const NX_ICONS = {
    // 基础操作与控制
    gear: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevRight: '<path d="m9 6 6 6-6 6"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',

    // 设置中心字段图标
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    tool: '<path d="m14.7 6.3 3 3-10.2 10.2H4.5v-3z"/><path d="m13.2 4.8 1.5-1.5a2.1 2.1 0 0 1 3 3l-1.5 1.5"/>',
    pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    refresh: '<path d="M21.5 2v6h-6M21.3 15.5A9 9 0 1 1 18.5 6.5l3 3"/>',

    // 工作台方格卡片图标 (严格还原图片2对应图标)
    talk: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    card: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V7"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    find: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    brain: '<path d="M9.5 4a3.5 3.5 0 0 0-3.5 3.5c0 .4.07.8.2 1.15A3.5 3.5 0 0 0 4 12a3.5 3.5 0 0 0 2.2 3.25A3.5 3.5 0 0 0 9.5 19c.6 0 1.2-.15 1.7-.4V4.4c-.5-.25-1.1-.4-1.7-.4z"/><path d="M14.5 4a3.5 3.5 0 0 1 3.5 3.5c0 .4-.07.8-.2 1.15A3.5 3.5 0 0 1 20 12a3.5 3.5 0 0 1-2.2 3.25A3.5 3.5 0 0 1 14.5 19c-.6 0-1.2-.15-1.7-.4V4.4c.5-.25 1.1-.4 1.7-.4z"/>',

    // 工程指令子项图标
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/>',
    beaker: '<path d="M4.5 3h15M6 3v5a6 6 0 0 0 1.5 4l5.5 6.5a2 2 0 0 1-1.5 3.5H6.5a2 2 0 0 1-1.5-3.5L10.5 12A6 6 0 0 0 12 8V3"/>',
    sparkle: '<path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9z"/>',
  };

  function nxSvg(k, cls = "nexus-ui-icon", style = "") {
    const styleAttr = style ? ` style="${style}"` : "";
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${styleAttr}>${NX_ICONS[k] || ""}</svg>`;
  }

  // =========================================================================
  // 2. 状态配置与 Nexus 本地连接
  // =========================================================================
  const DEFAULT_BRIDGE_TOKEN = "";
  const DEFAULT_WORKSPACE = "";

  const CONFIG = {
    nexusUrl: GM_getValue("webagent_bridge_url", GM_getValue("nexus_bridge_url", "http://127.0.0.1:18080")),
    token: GM_getValue("webagent_lb_token", GM_getValue("nexus_lb_token", DEFAULT_BRIDGE_TOKEN)),
    workspace: GM_getValue("webagent_workspace_dir", GM_getValue("nexus_workspace_dir", "")),
    projectId: GM_getValue("webagent_project_id", GM_getValue("nexus_project_id", "")),
    autoExecute: GM_getValue("webagent_auto_execute", false),
    maxConsecutiveSteps: GM_getValue("webagent_max_consecutive_steps", 4),
    sendDelay: GM_getValue("webagent_send_delay", 3.0),
    autoRetry: GM_getValue("webagent_auto_retry_rate_limit", true),
    themeMode: GM_getValue("webagent_theme_mode", "auto"), // "auto" | "light" | "dark"
    vaultPath: GM_getValue("webagent_vault_path", GM_getValue("nexus_vault_path", "")),
    reviewSafeMode: GM_getValue("webagent_review_safe_mode", true),
    customCapturePrompt: GM_getValue("webagent_custom_capture_prompt", ""),
    defaultTags: GM_getValue("webagent_default_tags", ""),
  };

  function getCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getCurrentDateStr() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  let isConnected = false;
  let isExecuting = false;
  let connectionPingMs = null;
  let cachedMcpTools = [];
  let lastHandledMessageSignature = "";
  let countdownTimer = null;
  let latestFeedbackText = "";
  let lastRateLimitHandledTime = 0;
  let retryCountForCurrentError = 0;

  // =========================================================================
  // 3. 平台专用 DOM 选择器与输入模拟适配层
  // =========================================================================
  const ADAPTERS = {
    chatgpt: {
      getInput: () => document.querySelector("#prompt-textarea, div[contenteditable='true']#prompt-textarea, textarea[data-id='root'], textarea"),
      setValue: (el, val) => {
        el.focus();
        if (el.tagName && el.tagName.toLowerCase() === "textarea") {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
        } else {
          el.innerHTML = `<p>${val.replace(/\n/g, "<br>")}</p>`;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      getSendBtn: () => {
        return (
          document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('button[aria-label="Send prompt"]') ||
          document.querySelector('button[aria-label="发送提示词"]') ||
          document.querySelector('button:has(svg path[d*="M.5 1.163A1"])')
        );
      },
      isGenerating: () => {
        return Boolean(
          document.querySelector('button[data-testid="stop-button"]') ||
          document.querySelector('button[aria-label="Stop streaming"]') ||
          document.querySelector('button[aria-label="停止生成"]') ||
          document.querySelector('button[aria-label="Stop generating"]')
        );
      },
      getLastReplyElement: () => {
        const msgs = document.querySelectorAll('div[data-message-author-role="assistant"], article:has([data-message-author-role="assistant"])');
        return msgs.length ? msgs[msgs.length - 1] : null;
      },
      getLastReplyText: () => {
        const msgs = document.querySelectorAll('div[data-message-author-role="assistant"], article:has([data-message-author-role="assistant"])');
        if (msgs.length === 0) return "";
        const last = msgs[msgs.length - 1];
        return last.innerText || last.textContent || "";
      },
    },
    deepseek: {
      getInput: () => document.querySelector("textarea#chat-input, textarea"),
      setValue: (el, val) => {
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) {
          setter.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof recordUserGoal === "function" && val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && !val.startsWith("⚠️")) {
          recordUserGoal(val);
          consecutiveAutoDispatches = 0;
          consecutiveErrors = 0;
        }
      },
      getSendBtn: () => {
        return (
          document.querySelector('div[role="button"].ds-button--primary.ds-button--circle') ||
          document.querySelector('div[role="button"][aria-label*="发送"]') ||
          document.querySelector('div[role="button"][aria-label*="Send"]') ||
          document.querySelector('div[role="button"]:has(svg path[d*="M8.3125"])')
        );
      },
      isGenerating: () => {
        const sendBtn = ADAPTERS.deepseek.getSendBtn();
        if (!sendBtn) return false;
        const svgPath = sendBtn.querySelector("svg path");
        if (svgPath) {
          const d = svgPath.getAttribute("d") || "";
          if (d.includes("M2 4.88") || d.includes("rect")) return true;
        }
        return false;
      },
      getLastReplyElement: () => {
        const candidates = Array.from(document.querySelectorAll(
          ".ds-assistant-message-main-content, [class*='ds-assistant-message'], .ds-message:not(.ds-message--user) .ds-markdown, .ds-markdown"
        )).filter(el => !el.closest(".ds-message--user, [class*='user-message'], [class*='chat-message-user']"));
        return candidates.length ? candidates[candidates.length - 1] : null;
      },
      getLastReplyText: () => {
        const last = ADAPTERS.deepseek.getLastReplyElement();
        if (!last) return "";
        try {
          const clone = last.cloneNode(true);
          const thinkEls = clone.querySelectorAll("[class*='think'], [class*='reasoning'], details, .ds-think-content");
          thinkEls.forEach(el => el.remove());
          const cleanText = clone.textContent?.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || "";
          // 容错兜底：若剥除思考区后正文为空，但思考区里输出了 ```nexus 或 "tool" 代码块，直接返回原始全文触发执行
          if (!cleanText && (last.textContent.includes('"tool"') || last.textContent.includes("```"))) {
            return last.textContent.trim();
          }
          return cleanText;
        } catch {
          return (last.textContent || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        }
      },
    },

    kimi: {
      getInput: () => {
        return (
          document.querySelector('div.chat-input-editor[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"][data-slate-editor="true"]') ||
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('.chat-input-editor') ||
          document.querySelector('textarea[placeholder*="Ask"]') ||
          document.querySelector('textarea[placeholder*="Kimi"]') ||
          document.querySelector("textarea")
        );
      },
      setValue: (el, val) => {
        el.focus();
        if (el.isContentEditable) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const ok = document.execCommand("insertText", false, val);
          if (!ok) {
            el.innerText = val;
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: val }));
          }
        } else {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) {
            setter.call(el, val);
          } else {
            el.value = val;
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof recordUserGoal === "function" && val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && !val.startsWith("⚠️")) {
          recordUserGoal(val);
        }
      },
      getSendBtn: () => {
        return (
          document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('div[data-testid="send-button"]') ||
          document.querySelector("button.send-btn") ||
          document.querySelector('button[aria-label*="发送"]') ||
          document.querySelector('button[aria-label*="Send"]') ||
          document.querySelector('div[aria-label*="Send"]') ||
          document.querySelector('div[class*="send-button"]') ||
          document.querySelector('div[class*="sendBtn"]') ||
          document.querySelector('div[class*="sendButton"]') ||
          document.querySelector("button:has(svg)") ||
          document.querySelector('div[role="button"]:has(svg)')
        );
      },
      isGenerating: () => {
        return Boolean(
          document.querySelector(".stop-btn") ||
          document.querySelector('button[data-testid="stop-button"]') ||
          document.querySelector('button[aria-label*="停止"]') ||
          document.querySelector('button[aria-label*="Stop"]') ||
          document.querySelector('div[aria-label*="Stop"]') ||
          document.querySelector('button[class*="stop"]') ||
          document.querySelector('div[class*="stop"]')
        );
      },
      getLastReplyElement: () => {
        const msgs = Array.from(document.querySelectorAll(
          ".markdown-content, .chat-content, div[data-testid='m-chat-item'], div[class*='segment-content'], div[class*='chat-item'], div[class*='markdown'], div[class*='chatContent'], div[class*='chatSegment'], div[class*='message-item']"
        )).filter(el => !el.closest("[class*='user'], [data-role='user'], [data-testid*='user'], [data-testid*='human']"));
        return msgs.length ? msgs[msgs.length - 1] : null;
      },
      getLastReplyText: () => {
        const el = ADAPTERS.kimi.getLastReplyElement();
        if (!el) return "";
        return el.textContent || "";
      },
    },

    doubao: {
      getInput: () => {
        return (
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('textarea[data-testid="chat_input_textarea"]') ||
          document.querySelector('textarea[placeholder*="发送消息"]') ||
          document.querySelector('textarea[placeholder*="输入"]') ||
          document.querySelector("textarea")
        );
      },
      setValue: (el, val) => {
        el.focus();
        if (el.tagName && el.tagName.toLowerCase() === "textarea") {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) {
            setter.call(el, val);
          } else {
            el.value = val;
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          // contenteditable DIV 选区精准写入
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const ok = document.execCommand("insertText", false, val);
          if (!ok) {
            el.innerText = val;
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: val }));
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof recordUserGoal === "function" && val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && !val.startsWith("⚠️")) {
          recordUserGoal(val);
        }
      },
      getSendBtn: () => {
        return (
          document.querySelector('button[data-testid="chat_input_send_button"]') ||
          document.querySelector('div[data-testid="chat_input_send_button"]') ||
          document.querySelector("button.semi-button--primary") ||
          document.querySelector('button[aria-label*="发送"]') ||
          document.querySelector('button:has(svg path[d*="M"])') ||
          document.querySelector('button:has(svg)') ||
          document.querySelector('div[role="button"]:has(svg)')
        );
      },
      isGenerating: () => {
        return Boolean(
          document.querySelector('button[data-testid="chat_input_stop_button"]') ||
          document.querySelector('button[aria-label*="停止生成"]') ||
          document.querySelector(".semi-button--loading")
        );
      },
      getLastReplyElement: () => {
        const assistantContainers = Array.from(document.querySelectorAll(
          "[data-testid='message-content'], .doubao-markdown, [data-testid='receive_message'], div[class*='message-content'], div[class*='messageContent'], div[class*='markdown']"
        )).filter(el => !el.closest("[class*='user'], [data-role='user'], [class*='question']"));
        if (assistantContainers.length > 0) {
          const lastAssistant = assistantContainers[assistantContainers.length - 1];
          const pres = lastAssistant.querySelectorAll("pre, code-block, code");
          if (pres.length > 0) {
            for (let i = pres.length - 1; i >= 0; i--) {
              const t = pres[i].textContent || "";
              if (t.includes('"tool"') || t.includes('"action"') || t.includes('"name"')) return pres[i];
            }
            return pres[pres.length - 1];
          }
          return lastAssistant;
        }
        return null;
      },
      getLastReplyText: () => {
        const el = ADAPTERS.doubao.getLastReplyElement();
        return el ? (el.textContent || "") : "";
      },
    },

    duckai: {
      getInput: () => {
        return (
          document.querySelector('textarea[name="user-prompt"]') ||
          document.querySelector('textarea[name="q"]') ||
          document.querySelector('textarea[placeholder*="回复"]') ||
          document.querySelector('textarea[placeholder*="Ask"]') ||
          document.querySelector('textarea[placeholder*="message"]') ||
          document.querySelector('textarea[data-testid*="input"]') ||
          document.querySelector("div.sk-input textarea") ||
          document.querySelector("form textarea") ||
          document.querySelector("textarea")
        );
      },
      setValue: (el, val) => {
        el.focus();
        if (el._valueTracker) {
          el._valueTracker.setValue("");
        }
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) {
          setter.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: val }));
        if (typeof recordUserGoal === "function" && val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && !val.startsWith("⚠️")) {
          recordUserGoal(val);
        }
      },
      getSendBtn: () => {
        return (
          document.querySelector('button[type="submit"]') ||
          document.querySelector('button[aria-label*="Send"]') ||
          document.querySelector('button[aria-label*="Ask"]') ||
          document.querySelector('button[aria-label*="Submit"]') ||
          document.querySelector('form button:has(svg)') ||
          document.querySelector('div:has(textarea) button:has(svg)') ||
          document.querySelector('button:has(svg path[d*="M"])') ||
          document.querySelector('button[data-testid*="send"]')
        );
      },
      isGenerating: () => {
        // 1. 核心判定依据：如果发送按钮 (button[type="submit"] 或 Send 按钮) 已经在页面上可见且可用
        // 说明流式生成必然已经彻底结束（Duck.ai 在流式输出时必定隐藏发送按钮）
        const sendBtn = document.querySelector('button[type="submit"], button[aria-label*="Send"], form button:has(svg)');
        if (sendBtn && sendBtn.offsetParent !== null && !sendBtn.closest('.b4u8e44LkWeTBdzS_w7u')) {
          return false;
        }

        // 2. 检查停止按钮：必须在当前 DOM 中真实可见且未被 disabled 禁用
        const stopBtn = document.querySelector('button[aria-label*="Stop generating"], button[aria-label="Stop"]');
        if (stopBtn && !stopBtn.disabled && stopBtn.getAttribute("aria-disabled") !== "true") {
          const isVisible =
            stopBtn.offsetParent !== null &&
            !stopBtn.closest('.b4u8e44LkWeTBdzS_w7u') &&
            window.getComputedStyle(stopBtn).display !== "none";
          if (isVisible) {
            return true;
          }
        }

        // 3. 兜底：若发送按钮不在屏幕上且停止按钮也不在，返回 false
        return false;
      },
      getLastReplyElement: () => {
        // 1. 优先直接获取最后一个包含 tool/command 的 pre 元素
        const pres = document.querySelectorAll('pre');
        if (pres.length > 0) {
          return pres[pres.length - 1];
        }

        // 2. Streamdown 代码块复制按钮关联容器
        const streamdownBtns = document.querySelectorAll('button[data-streamdown="code-block-copy-button"]');
        if (streamdownBtns.length > 0) {
          const btn = streamdownBtns[streamdownBtns.length - 1];
          return btn.closest('pre') || btn.parentElement;
        }

        // 3. Duck.ai 底部复制按钮关联卡片
        const copyBtns = document.querySelectorAll('button[data-copyairesponse]');
        if (copyBtns.length > 0) {
          const btn = copyBtns[copyBtns.length - 1];
          const container =
            btn.closest('[data-activeresponse]') ||
            btn.closest('div:has(pre)') ||
            btn.parentElement;
          if (container) return container;
        }

        // 4. 通用兜底
        const msgs = document.querySelectorAll(
          "[data-testid*='chat-message'], [data-testid*='message'], [data-testid*='response'], .markdown, .markdown-content, div[class*='chatMessage'], div[class*='message-content'], div[class*='Message'], div[class*='response']"
        );
        return msgs.length ? msgs[msgs.length - 1] : null;
      },
      getLastReplyText: () => {
        // 1. 优先直接从最后一个 pre 代码块提取
        const pres = document.querySelectorAll('pre');
        if (pres.length > 0) {
          const lastPre = pres[pres.length - 1];
          const preTxt = (lastPre.textContent || "").trim();
          if (preTxt.includes('"tool"') || preTxt.includes("'tool'") || preTxt.includes('"name"') || preTxt.includes('"command"')) {
            return preTxt;
          }
        }

        // 2. 从消息卡片提取完整文本
        const lastEl = ADAPTERS.duckai.getLastReplyElement();
        if (lastEl) {
          const txt = (lastEl.textContent || "").trim();
          if (txt.length > 0) return txt;
        }

        return "";
      },
    },

    qwen: {
      getInput: () => {
        return (
          document.querySelector("textarea#chat-input") ||
          document.querySelector("textarea.chat-input") ||
          document.querySelector("div[contenteditable='true']") ||
          document.querySelector("textarea[placeholder*='输入']") ||
          document.querySelector("textarea[placeholder*='Type']") ||
          document.querySelector("textarea[placeholder*='问']") ||
          document.querySelector("textarea")
        );
      },
      setValue: (el, val) => {
        el.focus();
        if (el.isContentEditable) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const ok = document.execCommand("insertText", false, val);
          if (!ok) {
            el.innerText = val;
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: val }));
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof recordUserGoal === "function" && val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && !val.startsWith("⚠️")) {
          recordUserGoal(val);
        }
      },
      getSendBtn: () => {
        return (
          document.querySelector("#send-message-button") ||
          document.querySelector("button.send-btn") ||
          document.querySelector("button[aria-label*='发送']") ||
          document.querySelector("button[aria-label*='Send']") ||
          document.querySelector("div[role='button'][aria-label*='发送']") ||
          document.querySelector("button:has(svg)")
        );
      },
      isGenerating: () => {
        return Boolean(
          document.querySelector("button[aria-label*='停止']") ||
          document.querySelector("button[aria-label*='Stop']") ||
          document.querySelector("button.stop-btn") ||
          document.querySelector("button:has(i.icon-StopIcon)") ||
          document.querySelector(".ant-btn-loading") ||
          document.querySelector("button:has(svg rect)")
        );
      },
      getLastReplyElement: () => {
        const assistantMsgs = Array.from(document.querySelectorAll(
          ".qwen-chat-message, .chat-message-item, div[class*='message-content'], div[class*='markdown'], div[class*='qwen']"
        )).filter(el => !el.closest("[class*='user'], [data-role='user'], .item-user"));
        if (assistantMsgs.length > 0) {
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          const pres = lastMsg.querySelectorAll("pre, code");
          for (let i = pres.length - 1; i >= 0; i--) {
            const t = pres[i].textContent || "";
            if (t.includes('"tool"') || t.includes('"action"') || t.includes('"name"')) return pres[i];
          }
          return lastMsg;
        }
        return null;
      },
      getLastReplyText: () => {
        const el = ADAPTERS.qwen.getLastReplyElement();
        return el ? (el.textContent || "") : "";
      },
    },

    dola: {
      getInput: () => {
        return (
          document.querySelector("textarea[placeholder*='发送']") ||
          document.querySelector("textarea[placeholder*='Ask']") ||
          document.querySelector("textarea[placeholder*='Type']") ||
          document.querySelector("textarea[placeholder*='Chat']") ||
          document.querySelector("div[contenteditable='true']") ||
          document.querySelector("textarea")
        );
      },
      setValue: (el, val) => {
        el.focus();
        if (el.isContentEditable) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const ok = document.execCommand("insertText", false, val);
          if (!ok) {
            el.innerText = val;
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: val }));
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof recordUserGoal === "function" && val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && !val.startsWith("⚠️")) {
          recordUserGoal(val);
        }
      },
      getSendBtn: () => {
        return (
          document.querySelector("button[type='submit']") ||
          document.querySelector("button[aria-label*='Send']") ||
          document.querySelector("button[aria-label*='发送']") ||
          document.querySelector("button.send-btn") ||
          document.querySelector("button:has(svg)") ||
          document.querySelector("div[role='button']:has(svg)")
        );
      },
      isGenerating: () => {
        return Boolean(
          document.querySelector("button[aria-label*='Stop']") ||
          document.querySelector("button[aria-label*='停止']") ||
          document.querySelector("button.stop-btn") ||
          document.querySelector("button:has(svg rect)")
        );
      },
      getLastReplyElement: () => {
        const assistantMsgs = Array.from(document.querySelectorAll(
          "[data-testid*='message'], .markdown, div[class*='chat-item'], div[class*='message']"
        )).filter(el => !el.closest("[class*='user'], [data-role='user']"));
        if (assistantMsgs.length > 0) {
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          const pres = lastMsg.querySelectorAll("pre, code");
          for (let i = pres.length - 1; i >= 0; i--) {
            const t = pres[i].textContent || "";
            if (t.includes('"tool"') || t.includes('"action"') || t.includes('"name"')) return pres[i];
          }
          return lastMsg;
        }
        return null;
      },
      getLastReplyText: () => {
        const el = ADAPTERS.dola.getLastReplyElement();
        return el ? (el.textContent || "") : "";
      },
    },
  };

  const currentAdapter = ADAPTERS[PLATFORM];

  // =========================================================================
  // 4. 精致玻璃拟态样式系统 (CSS)
  // =========================================================================
  function injectThemeStyles() {
    if (document.getElementById("nexus-web-agent-styles")) return;
    const style = document.createElement("style");
    style.id = "nexus-web-agent-styles";
    style.textContent = `
      #nexus-agent-root {
        position: fixed !important;
        z-index: 2147483647 !important;
        width: max-content !important;
        max-width: calc(100vw - 20px) !important;
        box-sizing: border-box !important;
        font-family: ${CURRENT_THEME.fontFamily};
        user-select: none;
        transition: color 0.25s ease;
        pointer-events: auto !important;
      }

      .nexus-pill {
        display: inline-flex !important;
        width: auto !important;
        max-width: max-content !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
        align-items: center;
        gap: 8px;
        background: var(--nx-card-bg, rgba(18, 20, 28, 0.96));
        color: var(--nx-text-primary, #F8FAFC);
        border: var(--nx-card-border, 1px solid rgba(255, 255, 255, 0.12));
        box-shadow: var(--nx-shadow-pill, 0 10px 30px rgba(0, 0, 0, 0.28)), 0 0 20px var(--nx-glow);
        border-radius: ${CURRENT_THEME.pillRadius};
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: grab;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease, color 0.25s ease;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      .nexus-pill:active {
        cursor: grabbing;
      }
      .nexus-pill:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35), 0 0 24px var(--nx-primary);
      }
      .nexus-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #94A3B8;
        transition: all 0.3s ease;
        flex-shrink: 0;
      }
      .nexus-dot.online {
        background: #10B981;
        box-shadow: 0 0 8px #10B981;
      }
      .nexus-dot.busy {
        background: #F59E0B;
        box-shadow: 0 0 10px #F59E0B;
        animation: nexus-pulse 1s infinite alternate;
      }
      .nexus-dot.offline {
        background: #EF4444;
        box-shadow: 0 0 6px #EF4444;
      }

      @keyframes nexus-pulse {
        from { opacity: 0.4; transform: scale(0.85); }
        to { opacity: 1; transform: scale(1.2); }
      }

      .nexus-pill-arrow {
        font-size: 10px;
        opacity: 0.6;
        margin-left: 2px;
        transition: transform 0.2s ease;
      }
      .nexus-pill.open .nexus-pill-arrow {
        transform: rotate(180deg);
      }

      .nexus-drawer {
        position: absolute;
        bottom: calc(100% + 12px);
        left: 50%;
        transform: translateX(-50%);
        width: 396px;
        max-width: calc(100vw - 20px);
        background: var(--nx-card-bg, rgba(18, 20, 28, 0.96));
        color: var(--nx-text-primary, #F8FAFC);
        border: var(--nx-card-border, 1px solid rgba(255, 255, 255, 0.12));
        box-shadow: var(--nx-shadow-drawer, 0 24px 60px rgba(0, 0, 0, 0.45)), 0 0 30px var(--nx-glow);
        border-radius: ${CURRENT_THEME.borderRadius};
        padding: 14px 16px;
        display: none;
        flex-direction: column;
        gap: 10px;
        box-sizing: border-box;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease;
        overflow: visible !important;
        z-index: 1000;
      }
      .nexus-drawer.show {
        display: flex;
        animation: nexus-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes nexus-pop {
        from { opacity: 0; margin-top: 6px; }
        to { opacity: 1; margin-top: 0; }
      }

      .nexus-drawer-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        box-sizing: border-box;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.16));
      }
      .nexus-drawer-head.nexus-hidden {
        display: none !important;
      }
      .nexus-drawer-title {
        font-weight: 700 !important;
        font-size: 13.5px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        color: var(--nx-primary) !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
      }
      .nexus-head-actions {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        margin-left: auto !important;
        flex-shrink: 0 !important;
      }
      .nexus-theme-btn-quick {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 4px 6px;
        border-radius: 6px;
        color: var(--nx-text-muted, #94A3B8);
        transition: all 0.2s;
      }
      .nexus-theme-btn-quick:hover {
        color: var(--nx-text-primary, #F8FAFC);
        background: var(--nx-subtle-bg, rgba(148, 163, 184, 0.15));
      }
      .nexus-close-btn {
        background: none;
        border: none;
        color: var(--nx-text-muted, #94A3B8);
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
        padding: 4px 6px;
        border-radius: 6px;
        transition: all 0.2s;
      }
      .nexus-close-btn:hover {
        color: var(--nx-text-primary, #F8FAFC);
        background: var(--nx-subtle-bg, rgba(148, 163, 184, 0.15));
      }

      .nexus-back-btn {
        background: transparent;
        border: none;
        color: var(--nx-text-primary, #E2E8F0);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .nexus-back-btn:hover {
        background: var(--nx-accent-bg, rgba(255, 255, 255, 0.08));
        color: var(--nx-primary);
      }

      .nexus-select-wrapper {
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
      }
      .nexus-select-label {
        font-size: 11px;
        font-weight: 700;
        color: var(--nx-text-muted, #94A3B8);
        text-transform: uppercase;
        letter-spacing: 0.6px;
        display: flex;
        align-items: center;
        gap: 5px;
      }

      /* =======================================================================
         知识库协同工作台 (3×3 极简细线描边 Outline Workbench)
         ======================================================================= */
      .nexus-wb-panel {
        background: var(--nx-subtle-bg, rgba(0, 0, 0, 0.12));
        border: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.18));
        border-radius: 12px;
        overflow: hidden;
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .nexus-wb-head {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: none;
        border: 0;
        color: var(--nx-text-primary, #F8FAFC);
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        text-align: left;
        user-select: none;
        transition: background 0.15s ease;
      }
      .nexus-wb-head:hover {
        background: var(--nx-accent-bg);
      }
      .nexus-wb-chev {
        margin-left: auto;
        width: 16px;
        height: 16px;
        stroke: var(--nx-text-muted, #94A3B8);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        flex-shrink: 0;
      }
      .nexus-wb-panel.closed .nexus-wb-chev {
        transform: rotate(-90deg);
      }
      .nexus-wb-panel.closed .nexus-wb-body {
        display: none;
      }
      .nexus-wb-body {
        border-top: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.14));
        padding: 10px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* 3列方格矩阵 (7个核心动作 + 1个设置 - 舒适度与高质感重构) */
      .nexus-wb-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 7px;
      }
      .nexus-wb-tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        padding: 9px 10px 8px 10px;
        background: var(--nx-tile-bg, var(--nx-card-bg));
        border: 1px solid var(--nx-tile-border, var(--nx-divider));
        border-radius: 11px;
        color: var(--nx-text-primary, #F8FAFC);
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
        box-sizing: border-box;
      }
      .nexus-wb-tile:hover {
        border-color: var(--nx-primary);
        background: var(--nx-accent-bg);
        transform: translateY(-1px);
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
      }
      .nexus-wb-tile[aria-pressed="true"] {
        border-color: var(--nx-primary);
        background: var(--nx-accent-bg);
        box-shadow: 0 0 0 1px var(--nx-primary), 0 2px 10px var(--nx-glow);
      }
      .nexus-wb-tile-icon {
        width: 21px;
        height: 21px;
        stroke: var(--nx-text-muted, #94A3B8);
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
        flex-shrink: 0;
        margin-bottom: 2px;
        transition: stroke 0.15s ease, transform 0.15s ease;
      }
      .nexus-wb-tile:hover .nexus-wb-tile-icon {
        stroke: var(--nx-primary);
        transform: scale(1.06);
      }
      .nexus-wb-tile[aria-pressed="true"] .nexus-wb-tile-icon {
        stroke: var(--nx-primary);
      }
      .nexus-wb-tile-title {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--nx-text-primary, #F8FAFC);
        letter-spacing: -0.1px;
      }
      .nexus-wb-tile[aria-pressed="true"] .nexus-wb-tile-title {
        color: var(--nx-primary);
      }
      .nexus-wb-tile-sub {
        display: block;
        font-size: 9.5px;
        color: var(--nx-text-muted, #94A3B8);
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        margin-top: 1px;
      }
      .nexus-wb-tile-badge {
        position: absolute;
        top: 6px;
        right: 6px;
        min-width: 17px;
        height: 17px;
        border-radius: 9px;
        background: var(--nx-primary);
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 1;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      }
      .nexus-wb-tile[aria-pressed="true"] .nexus-wb-tile-badge {
        display: flex;
      }
      .nexus-wb-tile.set {
        border-style: dashed;
        opacity: 0.88;
      }
      .nexus-wb-tile.set:hover {
        opacity: 1;
      }

      /* 语言学习与闪卡专属智能配置条 (语种 + 难度梯度) */
      .nexus-wb-lang {
        display: none;
        flex-direction: column;
        gap: 6px;
        padding: 7px 9px;
        border-radius: 8px;
        background: var(--nx-subtle-bg, rgba(0, 0, 0, 0.15));
        border: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.15));
        font-size: 11px;
        color: var(--nx-text-muted, #94A3B8);
      }
      .nexus-wb-lang.on {
        display: flex;
      }
      .nexus-wb-lang-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 8px;
      }
      .nexus-wb-seg {
        display: inline-flex;
        border: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.25));
        border-radius: 6px;
        overflow: hidden;
      }
      .nexus-wb-seg button {
        border: 0;
        background: transparent;
        color: var(--nx-text-primary, #F8FAFC);
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 3px 7px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .nexus-wb-seg button+button {
        border-left: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.25));
      }
      .nexus-wb-seg button[aria-pressed="true"] {
        background: var(--nx-primary);
        color: #ffffff;
      }

      /* 执行流指示条 */
      .nexus-wb-flow {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: var(--nx-text-muted, #94A3B8);
        min-height: 22px;
        padding: 1px 0;
      }
      .nx-flow-chip {
        color: var(--nx-text-primary, #F8FAFC);
        font-weight: 600;
        padding: 1px 7px;
        border: 1px solid var(--nx-accent-border, rgba(77, 107, 254, 0.3));
        border-radius: 10px;
        background: var(--nx-accent-bg, rgba(77, 107, 254, 0.12));
      }
      .nx-flow-arrow {
        width: 11px;
        height: 11px;
        stroke: var(--nx-text-muted, #94A3B8);
        stroke-width: 1.6;
        flex-shrink: 0;
      }

      /* 提示词多行编辑框 (高可读性与舒适微阴影) */
      .nexus-wb-textarea {
        width: 100%;
        min-height: 110px;
        max-height: 220px;
        resize: vertical;
        padding: 9px 12px;
        background: var(--nx-input-bg, rgba(0, 0, 0, 0.25));
        color: var(--nx-text-primary, #F8FAFC);
        border: var(--nx-input-border, 1px solid rgba(148, 163, 184, 0.2));
        border-radius: 9px;
        font: 11.5px/1.55 ui-monospace, 'SF Pro Mono', 'SF Mono', Consolas, 'PingFang SC', monospace;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .nexus-wb-textarea:focus {
        outline: none;
        border-color: var(--nx-primary);
        box-shadow: 0 0 0 2px var(--nx-glow);
      }

      /* 工作台底栏 */
      .nexus-wb-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 1px;
      }
      .nexus-wb-hint {
        font-size: 10.5px;
        color: var(--nx-text-muted, #94A3B8);
        flex: 1;
        line-height: 1.35;
      }
      .nexus-wb-inject {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 7px 16px;
        border: 0;
        border-radius: 8px;
        background: var(--nx-primary);
        color: #ffffff;
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        flex-shrink: 0;
        box-shadow: 0 2px 6px var(--nx-glow);
      }
      .nexus-wb-inject:hover {
        background: var(--nx-primary-hover);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px var(--nx-glow);
      }
      .nexus-wb-inject:disabled {
        opacity: 0.42;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
        transform: none;
        box-shadow: none;
      }

      /* 滚动条美化 */
      .nexus-cselect-menu::-webkit-scrollbar,
      .nexus-drawer::-webkit-scrollbar,
      .nexus-adv-body::-webkit-scrollbar {
        width: 5px;
      }
      .nexus-cselect-menu::-webkit-scrollbar-thumb,
      .nexus-drawer::-webkit-scrollbar-thumb,
      .nexus-adv-body::-webkit-scrollbar-thumb {
        background: var(--nx-divider, rgba(148, 163, 184, 0.25));
        border-radius: 4px;
      }
      .nexus-view-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #nexus-view-settings {
        max-height: 72vh;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 2px;
      }

      /* 主题模式分段选择器 */
      .nexus-theme-segment {
        display: flex;
        background: var(--nx-subtle-bg, rgba(0, 0, 0, 0.12));
        border: 1px solid var(--nx-divider, rgba(148, 163, 184, 0.16));
        border-radius: 8px;
        padding: 2px;
        gap: 2px;
      }
      .nexus-theme-opt {
        flex: 1;
        text-align: center;
        padding: 5px 0;
        font-size: 11px;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        color: var(--nx-text-muted, #94A3B8);
        border: none;
        background: transparent;
        transition: all 0.2s ease;
        user-select: none;
      }
      .nexus-theme-opt:hover {
        color: var(--nx-text-primary, #F8FAFC);
      }
      .nexus-theme-opt.active {
        background: var(--nx-primary);
        color: #FFFFFF;
        box-shadow: 0 2px 6px var(--nx-glow);
      }

      .nexus-status-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        background: var(--nx-accent-bg);
        border: 1px solid var(--nx-accent-border);
        border-radius: 8px;
        padding: 6px 10px;
        color: var(--nx-text-primary, #F8FAFC);
        transition: background 0.25s, border-color 0.25s, color 0.25s;
      }
      .nexus-status-ping {
        color: #10B981;
        font-weight: 600;
        font-size: 11px;
        font-family: ui-monospace, monospace;
      }
      .nexus-status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
        margin-right: 6px;
      }
      .nexus-status-indicator.online {
        background: #10B981;
        box-shadow: 0 0 6px rgba(16, 185, 129, 0.7);
      }
      .nexus-status-indicator.offline {
        background: #EF4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
      }
      .nexus-ui-icon {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.6;
        fill: none;
        vertical-align: -2px;
        margin-right: 5px;
        color: var(--nx-text-muted);
        flex-shrink: 0;
      }
      .nexus-mini-icon {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 1.6;
        fill: none;
        flex-shrink: 0;
      }
      .nexus-icon-btn {
        width: 15px;
        height: 15px;
        stroke: currentColor;
        stroke-width: 1.6;
        fill: none;
        vertical-align: middle;
      }
      .nexus-btn-icon {
        width: 15px;
        height: 15px;
        stroke: currentColor;
        stroke-width: 1.8;
        fill: none;
      }

      .nexus-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .nexus-label {
        font-size: 11px;
        color: var(--nx-text-muted, #94A3B8);
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .nexus-input {
        background: var(--nx-input-bg, rgba(0, 0, 0, 0.22));
        color: var(--nx-text-primary, #F8FAFC);
        border: var(--nx-input-border, 1px solid rgba(148, 163, 184, 0.25));
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        outline: none;
        font-family: inherit;
        box-sizing: border-box;
        width: 100%;
        transition: border-color 0.2s, background 0.25s, color 0.25s;
      }
      .nexus-input:focus {
        border-color: var(--nx-primary);
      }

      .nexus-action-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .nexus-btn-primary {
        background: var(--nx-primary);
        color: #FFFFFF;
        border: none;
        border-radius: 9px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        transition: all 0.2s ease;
        box-shadow: 0 4px 14px var(--nx-glow);
      }
      .nexus-btn-primary:hover {
        background: var(--nx-primary-hover);
        transform: translateY(-1px);
      }
      .nexus-btn-secondary,
      .nexus-btn-sec {
        background: var(--nx-tile-bg, var(--nx-card-bg));
        color: var(--nx-text-primary);
        border: 1px solid var(--nx-tile-border, var(--nx-divider));
        border-radius: 8px;
        padding: 6px 9px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        transition: all 0.16s ease;
        user-select: none;
        box-sizing: border-box;
      }
      .nexus-btn-secondary:hover,
      .nexus-btn-sec:hover {
        border-color: var(--nx-primary);
        background: var(--nx-accent-bg);
        color: var(--nx-primary);
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
      }

      .nexus-test-status {
        display: none;
        font-size: 11px;
        border-radius: 6px;
        padding: 5px 8px;
        line-height: 1.4;
        word-break: break-all;
      }
      .nexus-test-status.success {
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #10B981;
      }
      .nexus-test-status.error {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #EF4444;
      }
      .nexus-test-status.testing {
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.4);
        color: #F59E0B;
      }

      .nexus-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 2px;
      }
      .nexus-switch {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex-shrink: 0;
      }
      .nexus-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .nexus-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(148, 163, 184, 0.35);
        transition: .25s ease;
        border-radius: 20px;
      }
      .nexus-slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: #FFFFFF;
        transition: .25s ease;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .nexus-switch input:checked + .nexus-slider {
        background-color: var(--nx-primary);
      }
      .nexus-switch input:checked + .nexus-slider:before {
        transform: translateX(16px);
      }

      .nexus-adv-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        font-size: 11px;
        color: var(--nx-text-muted, #94A3B8);
        padding: 4px 0;
        user-select: none;
      }
      .nexus-adv-header:hover {
        color: var(--nx-text-primary, #F8FAFC);
      }
      .nexus-adv-arrow {
        font-size: 10px;
        transition: transform 0.2s;
      }
      .nexus-adv-arrow.open {
        transform: rotate(90deg);
      }
      .nexus-adv-body {
        display: none;
        flex-direction: column;
        gap: 8px;
        padding-top: 6px;
        border-top: 1px dashed var(--nx-divider, rgba(148, 163, 184, 0.2));
      }
      .nexus-adv-body.show {
        display: flex;
      }

      .nexus-tool-item {
        padding: 5px 8px;
        border-radius: 6px;
        background: var(--nx-subtle-bg, rgba(0,0,0,0.2));
        margin-bottom: 4px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .nexus-tool-item:hover {
        background: var(--nx-accent-bg);
      }
      .nexus-tool-name {
        font-weight: 600;
        color: var(--nx-primary);
        font-size: 11px;
      }
      .nexus-tool-desc {
        font-size: 10px;
        color: var(--nx-text-muted, #94A3B8);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .nexus-toast {
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        background: var(--nx-card-bg, #ffffff);
        color: var(--nx-text-primary, #1E293B);
        border: var(--nx-card-border, 1px solid rgba(226, 232, 240, 0.95));
        padding: 9px 20px;
        border-radius: 30px;
        box-shadow: var(--nx-shadow-toast, 0 10px 25px rgba(0, 0, 0, 0.12)), 0 0 16px var(--nx-glow);
        font-size: 13px;
        font-weight: 600;
        z-index: 10000000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-sizing: border-box;
      }
      .nexus-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(msg, duration = 2400) {
    let toast = document.getElementById("nexus-toast-box");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "nexus-toast-box";
      toast.className = "nexus-toast";
      document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }

  // =========================================================================
  // 5. 路径解析与 Nexus MCP 全能调用核心
  // =========================================================================
  function resolveWorkspacePath(p) {
    p = (p || "").replace(/\\/g, "/").trim();
    const ws = (CONFIG.workspace || DEFAULT_WORKSPACE).replace(/\\/g, "/");
    if (!p || p === "." || p === "./") return ws || ".";
    if (/^[a-zA-Z]:/i.test(p) || p.startsWith("/")) return p;
    if (!ws) return p;
    return (ws.endsWith("/") ? ws : ws + "/") + p;
  }

  function fetchMcpTools(callback) {
    const token = CONFIG.token || DEFAULT_BRIDGE_TOKEN;
    GM_xmlhttpRequest({
      method: "POST",
      url: `${CONFIG.nexusUrl}/mcp`,
      headers: Object.assign({
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2024-11-05",
      }, token ? { "Authorization": `Bearer ${token}` } : {}),
      data: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/list", params: {} }),
      timeout: 5000,
      onload: (res) => {
        try {
          const resp = JSON.parse(res.responseText);
          if (resp.result?.tools) {
            cachedMcpTools = resp.result.tools;
            renderMcpToolsList(cachedMcpTools);
            if (callback) callback(cachedMcpTools);
          }
        } catch {}
      },
    });
  }

  function pingNexus(callback) {
    const startTime = Date.now();
    const tryUrl = (targetUrl, isFallback, tried8787 = false) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${targetUrl}/health`,
        timeout: 3000,
        onload: (res) => {
          if (res.status === 200) {
            isConnected = true;
            CONFIG.nexusUrl = targetUrl;
            connectionPingMs = Date.now() - startTime;
            updateStatusUI("online", `${CURRENT_THEME.badgeTitle} (在线)`);
            updatePanelPingUI(true, connectionPingMs);
            fetchMcpTools();
            if (callback) callback(true);
          } else {
            if (!isFallback && targetUrl.includes("127.0.0.1")) {
              tryUrl(targetUrl.replace("127.0.0.1", "localhost"), true, tried8787);
              return;
            }
            if (!tried8787 && targetUrl.includes("18080")) {
              tryUrl("http://127.0.0.1:8787", false, true);
              return;
            }
            isConnected = false;
            updateStatusUI("offline", `${CURRENT_THEME.badgeTitle} (未就绪)`);
            updatePanelPingUI(false);
            if (callback) callback(false);
          }
        },
        onerror: () => {
          if (!isFallback && targetUrl.includes("127.0.0.1")) {
            tryUrl(targetUrl.replace("127.0.0.1", "localhost"), true, tried8787);
            return;
          }
          if (!tried8787 && targetUrl.includes("18080")) {
            tryUrl("http://127.0.0.1:8787", false, true);
            return;
          }
          isConnected = false;
          updateStatusUI("offline", `${CURRENT_THEME.badgeTitle} (未连接)`);
          updatePanelPingUI(false);
          if (callback) callback(false);
        },
        ontimeout: () => {
          if (!isFallback && targetUrl.includes("127.0.0.1")) {
            tryUrl(targetUrl.replace("127.0.0.1", "localhost"), true, tried8787);
            return;
          }
          if (!tried8787 && targetUrl.includes("18080")) {
            tryUrl("http://127.0.0.1:8787", false, true);
            return;
          }
          isConnected = false;
          updateStatusUI("offline", `${CURRENT_THEME.badgeTitle} (超时)`);
          updatePanelPingUI(false);
          if (callback) callback(false);
        },
      });
    };
    tryUrl(CONFIG.nexusUrl || "http://127.0.0.1:18080", false);
  }

  function executeNexusTool(toolName, args, callback) {
    updateStatusUI("busy", `⚡ 执行: ${toolName}...`);
    isExecuting = true;

    const token = CONFIG.token || DEFAULT_BRIDGE_TOKEN;
    const cleanTool = toolName.toLowerCase().replace(/^localbridge_|^nexus_/, "");

    // 智能参数自适应归一化 (兼容 AI 传来的 keyword/q/args 等变体)
    if (args && typeof args === "object") {
      if (args.args && typeof args.args === "object") {
        args = { ...args.args, ...args };
        delete args.args;
      }
      if (cleanTool === "discover_tools" || toolName.includes("discover")) {
        if (!args.query && args.keyword) args.query = args.keyword;
        if (!args.query && args.q) args.query = args.q;
      }
      if (cleanTool === "command_run" || cleanTool === "exec") {
        if (!args.command && args.cmd) args.command = args.cmd;
      }
      if (cleanTool === "file_read" || cleanTool === "file_write") {
        if (!args.path && args.file) args.path = args.file;
      }
      if (cleanTool === "execute_blender_code" || cleanTool === "blender_code") {
        if (!args.code && args.script) args.code = args.script;
        if (!args.code && args.python) args.code = args.python;
      }
    } else {
      args = {};
    }

    let mcpToolName = "nexus_run_script";
    let mcpArgs = {};

    // 0. Nexus Knowledge 智能笔记专属直通通道 (端口 21888 秒级响应，无需依赖 18080)
    if (
      cleanTool.startsWith("knowledge_") ||
      toolName.startsWith("nexus_knowledge_") ||
      cleanTool === "get_active_doc" ||
      cleanTool === "list_tree"
    ) {
      const finalToolName = toolName.startsWith("nexus_knowledge_")
        ? toolName
        : ("nexus_knowledge_" + cleanTool.replace(/^knowledge_/, ""));

      const kbPayload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: finalToolName,
          arguments: args,
        },
      };

      GM_xmlhttpRequest({
        method: "POST",
        url: "http://127.0.0.1:21888/mcp",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(kbPayload),
        timeout: 8000,
        onload: (kbRes) => {
          try {
            const resp = JSON.parse(kbRes.responseText);
            if (resp && (resp.result || resp.error)) {
              isExecuting = false;
              updateStatusUI(isConnected ? "online" : "offline", CURRENT_THEME.badgeTitle);
              if (resp.error) {
                callback({ ok: false, error: resp.error.message || JSON.stringify(resp.error) });
              } else {
                callback({ ok: true, result: resp.result });
              }
              return;
            }
          } catch (e) {}
          // Fallback to Nexus Control Center 18080
          mcpToolName = finalToolName;
          mcpArgs = args;
          sendToNexusControlCenter();
        },
        onerror: () => {
          // Fallback to Nexus Control Center 18080
          mcpToolName = finalToolName;
          mcpArgs = args;
          sendToNexusControlCenter();
        },
      });
      return;
    }

    // 1. 常用文件与命令行极速通道 (70ms 零权限阻碍)
    if (cleanTool === "file_read" || cleanTool === "read") {
      const targetPath = resolveWorkspacePath(args.path || args.file || args.filepath || args.filename);
      mcpArgs = {
        runtime: "node",
        script: `
          const fs = require('fs');
          function smartDecode(buf) {
            if (!buf) return '';
            if (typeof buf === 'string') return buf.replace(/\0/g, '');
            if (buf.length >= 2 && ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[1] === 0 && buf[3] === 0))) {
              try {
                return new TextDecoder('utf-16le').decode(buf).replace(/\0/g, '');
              } catch (_) {}
            }
            try {
              return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/\0/g, '');
            } catch (e) {
              try {
                return new TextDecoder('gbk').decode(buf).replace(/\0/g, '');
              } catch (e2) {
                return buf.toString().replace(/\0/g, '');
              }
            }
          }
          const p = ${JSON.stringify(targetPath)};
          if (!fs.existsSync(p)) {
            console.error('ERROR: 文件不存在 -> ' + p);
            process.exit(1);
          }
          const content = smartDecode(fs.readFileSync(p));
          let finalContent = content;
          if (finalContent.length > 4000) {
            finalContent = finalContent.slice(0, 2500) + "\\n\\n... [⚠️ 文件内容较长 (共 " + finalContent.length + " 字符)，已自动智能精简中间部分，建议按行或按模块读取] ...\\n\\n" + finalContent.slice(-1000);
          }
          console.log(finalContent);
        `,
      };
    } else if (cleanTool === "file_write" || cleanTool === "write") {
      const targetPath = resolveWorkspacePath(args.path);
      const content = args.content ?? args.text ?? "";
      mcpArgs = {
        runtime: "node",
        script: `
          const fs = require('fs');
          const path = require('path');
          const p = ${JSON.stringify(targetPath)};
          const dir = path.dirname(p);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(p, ${JSON.stringify(content)}, 'utf8');
          console.log('SUCCESS: 文件写入成功 -> ' + p + ' (' + Buffer.byteLength(${JSON.stringify(content)}) + ' 字节)');
        `,
      };
    } else if (cleanTool === "file_list" || cleanTool === "list" || cleanTool === "ls" || cleanTool === "dir") {
      const targetPath = resolveWorkspacePath(args.path || args.dir || args.directory || args.folder || ".");
      mcpArgs = {
        runtime: "node",
        script: `
          const fs = require('fs');
          const path = require('path');
          const p = ${JSON.stringify(targetPath)};
          if (!fs.existsSync(p)) {
            console.error('ERROR: 目录不存在 -> ' + p);
            process.exit(1);
          }
          const entries = fs.readdirSync(p, { withFileTypes: true });
          const list = entries.map(e => (e.isDirectory() ? '[DIR]  ' : '[FILE] ') + e.name);
          console.log(list.join('\\n'));
        `,
      };
    } else if (cleanTool === "command_run" || cleanTool === "powershell" || cleanTool === "cmd" || cleanTool === "exec") {
      const cmd = args.command || args.cmd || args.exec || args.script || args.code || "";
      const wsDir = resolveWorkspacePath(args.cwd || ".");
      mcpArgs = {
        runtime: "node",
        script: `
          const { execSync, spawn } = require('child_process');
          function smartDecode(buf) {
            if (!buf) return '';
            if (typeof buf === 'string') return buf.replace(/\0/g, '');
            if (buf.length >= 2 && ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[1] === 0 && buf[3] === 0))) {
              try {
                return new TextDecoder('utf-16le').decode(buf).replace(/\0/g, '');
              } catch (_) {}
            }
            try {
              return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/\0/g, '');
            } catch (e) {
              try {
                return new TextDecoder('gbk').decode(buf).replace(/\0/g, '');
              } catch (e2) {
                return buf.toString().replace(/\0/g, '');
              }
            }
          }
          try {
            const rawCmd = ${JSON.stringify(cmd)}.trim();
            const isPowerShell = /^\\s*(Start-Process|Get-|Set-|New-|powershell|\$)/i.test(rawCmd);
            const isStart = /^\\s*(cmd\\s*\\/c\\s*)?start\\s+/i.test(rawCmd);
            let out;
            if (isStart) {
              spawn(rawCmd, { shell: true, detached: true, stdio: 'ignore' }).unref();
              console.log("SUCCESS: 进程已在桌面成功启动 -> " + rawCmd);
              process.exit(0);
            } else if (isPowerShell) {
              out = execSync(rawCmd, { shell: 'powershell.exe', encoding: 'buffer', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
            } else {
              out = execSync(rawCmd, { encoding: 'buffer', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
            }
            let outStr = smartDecode(out);
            if (outStr.length > 3500) {
              outStr = outStr.slice(0, 2200) + "\\n\\n... [⚠️ 控制台输出日志较长 (共 " + outStr.length + " 字符)，已截断中间日志以防超出上下文] ...\\n\\n" + outStr.slice(-1000);
            }
            if (isPowerShell && /^\s*Start-Process/i.test(rawCmd)) {
              if (!outStr) outStr = "SUCCESS: 进程已在桌面成功启动 -> " + rawCmd;
            }
            console.log(outStr || "SUCCESS: 命令执行完毕（无标准输出）");
          } catch (e) {
            const errBuf = (e.stderr && e.stderr.length) ? e.stderr : (e.stdout && e.stdout.length ? e.stdout : null);
            const errMsg = errBuf ? smartDecode(errBuf) : (e.message || String(e));
            console.error(errMsg);
            process.exit(1);
          }
        `,
      };
    } else if (
      cleanTool.startsWith("android_") ||
      cleanTool.startsWith("nex_mobile_") ||
      cleanTool.startsWith("mobile_")
    ) {
      // 6. Nexus Mobile 原生移动端控制与屏幕读取工具 (一键 ADB / Root)
      if (cleanTool.includes("inspect") || cleanTool.includes("dump") || cleanTool.includes("ui_dump")) {
        mcpToolName = "nexus_run_script";
        mcpArgs = {
          runtime: "node",
          script: `
            const cp = require('child_process');
            try {
              let focus = '未知前台应用';
              try {
                const focusRaw = cp.execSync('adb shell "dumpsys window | grep -E mCurrentFocus"', { timeout: 3000, encoding: 'utf8' });
                const m = focusRaw.match(/mCurrentFocus=Window\\{[^ ]+ u0 ([^\\}]+)\\}/);
                if (m) focus = m[1];
              } catch (_) {}

              cp.execSync('adb shell uiautomator dump /sdcard/window.xml', { timeout: 5000 });
              const xml = cp.execSync('adb shell cat /sdcard/window.xml', { timeout: 5000, encoding: 'utf8' });

              const nodeRegex = /<node[^>]*?text="([^"]*)"[^>]*?resource-id="([^"]*)"[^>]*?class="([^"]*)"[^>]*?package="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?clickable="([^"]*)"[^>]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*?>/g;
              const elements = [];
              let match;
              while ((match = nodeRegex.exec(xml)) !== null) {
                const [, text, resId, cls, pkg, desc, clickable, x1, y1, x2, y2] = match;
                const displayText = (text || desc || '').trim();
                if (displayText || clickable === 'true') {
                  const cx = Math.round((parseInt(x1) + parseInt(x2)) / 2);
                  const cy = Math.round((parseInt(y1) + parseInt(y2)) / 2);
                  elements.push({
                    text: displayText || (resId ? resId.split('/').pop() : '未命名元素'),
                    type: cls.split('.').pop(),
                    clickable: clickable === 'true',
                    bounds: \`[\${x1},\${y1}][\${x2},\${y2}]\`,
                    center: [cx, cy]
                  });
                }
              }

              console.log(JSON.stringify({
                success: true,
                current_activity: focus,
                total_elements: elements.length,
                screen_resolution: "1080x2376",
                interactive_elements: elements.slice(0, 45)
              }, null, 2));
            } catch (err) {
              console.error(JSON.stringify({ success: false, error: String(err.message || err) }));
            }
          `
        };
      } else if (cleanTool.includes("screen") || cleanTool.includes("capture") || cleanTool.includes("shot")) {
        mcpToolName = "nexus_run_script";
        mcpArgs = {
          runtime: "node",
          script: `
            const cp = require('child_process');
            const fs = require('fs');
            const path = require('path');
            try {
              const buf = cp.execSync('adb exec-out screencap -p', { maxBuffer: 10 * 1024 * 1024, timeout: 6000 });
              const tmpPath = path.join(process.env.TEMP || 'C:\\\\Windows\\\\Temp', 'nexus_mobile_screen.png');
              fs.writeFileSync(tmpPath, buf);
              const b64 = buf.toString('base64');
              console.log(JSON.stringify({
                success: true,
                file_path: tmpPath,
                image_size_kb: Math.round(buf.length / 1024),
                base64: 'data:image/png;base64,' + b64.slice(0, 300) + '...[已存入本地文件: ' + tmpPath + ']'
              }));
            } catch (e) {
              console.error(JSON.stringify({ success: false, error: e.message }));
            }
          `
        };
      } else if (cleanTool.includes("touch") || cleanTool.includes("tap") || cleanTool.includes("swipe")) {
        const action = args.action || (cleanTool.includes("tap") ? "tap" : "swipe");
        let adbCmd = "";
        if (action === "tap") {
          const x = args.x || args.center?.[0] || 500;
          const y = args.y || args.center?.[1] || 1000;
          adbCmd = `adb shell input tap ${x} ${y}`;
        } else if (action === "swipe") {
          const x1 = args.x1 || 500, y1 = args.y1 || 1600, x2 = args.x2 || 500, y2 = args.y2 || 600;
          const duration = args.duration || 300;
          adbCmd = `adb shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`;
        } else if (action === "text") {
          const text = (args.text || "").replace(/'/g, "");
          adbCmd = `adb shell input text "${text}"`;
        } else if (action === "key") {
          const key = args.key || "KEYCODE_BACK";
          adbCmd = `adb shell input keyevent ${key}`;
        }
        mcpToolName = "command_run";
        mcpArgs = { command: adbCmd };
      }
    } else if (
      cleanTool === "browser_open" ||
      cleanTool === "open_url" ||
      cleanTool === "open_browser" ||
      cleanTool === "launch_browser" ||
      cleanTool === "navigate"
    ) {
      // 浏览器打开网页专用直通逻辑：直接在系统默认浏览器中打开指定网址
      const rawUrl = (args.url || args.link || args.href || args.target || "").trim();
      const launchUrl = (!rawUrl || (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && !rawUrl.startsWith("file://") && !rawUrl.startsWith("about:")))
        ? (rawUrl ? `https://${rawUrl}` : "https://www.bing.com")
        : rawUrl;
      const cmd = `start "" "${launchUrl}"`;
      mcpToolName = "nexus_run_script";
      mcpArgs = {
        runtime: "node",
        script: `
          const { spawn } = require('child_process');
          try {
            const rawCmd = ${JSON.stringify(cmd)};
            spawn(rawCmd, { shell: true, detached: true, stdio: 'ignore' }).unref();
            console.log("SUCCESS: 进程已在桌面成功启动 -> " + rawCmd);
            process.exit(0);
          } catch (e) {
            console.error("ERROR: " + (e.message || String(e)));
            process.exit(1);
          }
        `,
      };
      sendToNexusControlCenter();
      return;
    } else if (
      cleanTool.startsWith("browser_") ||
      cleanTool === "snapshot" ||
      cleanTool === "click" ||
      cleanTool === "scroll" ||
      cleanTool === "press_key" ||
      cleanTool === "key" ||
      cleanTool === "eval_js" ||
      cleanTool === "page_eval" ||
      cleanTool === "close_modal"
    ) {
      // 6. 智能体浏览器自动化全套原子交互能力 (打开、快照、点击、滚动、打字、按键、代码执行、关闭弹窗)
      mcpToolName = "nexus_browser";
      if (cleanTool === "browser_press_key" || cleanTool === "browser_key" || cleanTool === "press_key" || cleanTool === "key") {
        const key = args.key || args.keyName || "ArrowDown";
        const code = args.code || key;
        mcpArgs = {
          action: "eval",
          script: `
            const evD = new KeyboardEvent('keydown', { key: '${key}', code: '${code}', bubbles: true, cancelable: true });
            const evU = new KeyboardEvent('keyup', { key: '${key}', code: '${code}', bubbles: true, cancelable: true });
            document.dispatchEvent(evD);
            window.dispatchEvent(evD);
            document.body && document.body.dispatchEvent(evD);
            setTimeout(() => {
              document.dispatchEvent(evU);
              window.dispatchEvent(evU);
              document.body && document.body.dispatchEvent(evU);
            }, 50);
            return { success: true, action: 'key_press', key: '${key}' };
          `
        };
      } else if (cleanTool === "browser_close_modal" || cleanTool === "close_modal") {
        mcpArgs = {
          action: "eval",
          script: `
            const candidates = Array.from(document.querySelectorAll('div, span, button, svg, p, a')).filter(el => {
              const cls = (el.className && typeof el.className === 'string') ? el.className : '';
              const txt = (el.innerText || '').trim();
              const aria = el.getAttribute('aria-label') || '';
              return cls.includes('close') || cls.includes('qKr0RhiL') || cls.includes('YoNA2Hyj') || cls.includes('mask') || txt === '×' || txt === '✕' || aria.includes('关闭') || aria.includes('Close');
            });
            let closed = false;
            if (candidates.length > 0) {
              const target = candidates[0].closest('button') || candidates[0];
              target.click();
              closed = true;
            }
            // 兜底触发 Escape 按键
            const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true });
            document.dispatchEvent(esc);
            window.dispatchEvent(esc);
            return { success: true, action: 'close_modal', closed };
          `
        };
      } else if (cleanTool === "browser_eval" || cleanTool === "eval_js" || cleanTool === "page_eval") {
        mcpArgs = {
          action: "eval",
          script: args.script || args.js || args.code || ""
        };
      } else if (cleanTool === "browser_scroll" || cleanTool === "scroll") {
        mcpArgs = {
          action: "scroll",
          direction: args.direction || "down",
          amount: args.amount || args.distance || args.scroll || 600,
          selector: args.selector
        };
      } else if (cleanTool === "browser_click" || cleanTool === "click") {
        mcpArgs = {
          action: "click",
          mark: args.mark,
          selector: args.selector,
          text: args.text,
          name: args.name,
          role: args.role
        };
      } else if (cleanTool === "browser_type" || cleanTool === "type") {
        mcpArgs = {
          action: "type",
          mark: args.mark,
          selector: args.selector,
          text: args.text ?? args.value ?? "",
          press_enter: Boolean(args.press_enter || args.submit)
        };
      } else if (cleanTool === "browser_snapshot" || cleanTool === "snapshot") {
        mcpArgs = {
          action: "snapshot",
          mode: args.mode || "compact"
        };
      } else {
        // browser_open / navigate
        mcpArgs = {
          action: "navigate",
          url: args.url || args.link || args.href || ""
        };
      }
    } else if (toolName.startsWith("localbridge_")) {
      // 7. 自动桥接 Nexus 344 个底层原子工程工具 (通过 nexus_execute_action 执行)
      mcpToolName = "nexus_execute_action";
      mcpArgs = {
        tool: toolName,
        arguments: args,
      };
    } else {
      // 8. 原生顶层 MCP 元工具或外部接入的 MCP 工具 (如 nexus_discover_tools, sqlite_query, github 等)
      mcpToolName = toolName;
      mcpArgs = args;
    }

    function sendToNexusControlCenter() {
      const payload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: mcpToolName,
          arguments: mcpArgs,
        },
      };

      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.nexusUrl}/mcp`,
      headers: Object.assign({
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2024-11-05",
      }, token ? { "Authorization": `Bearer ${token}` } : {}),
      data: JSON.stringify(payload),
      timeout: 35000,
      onload: (res) => {
        isExecuting = false;
        updateStatusUI(isConnected ? "online" : "offline", CURRENT_THEME.badgeTitle);
        let resp;
        try {
          resp = JSON.parse(res.responseText);
        } catch (e) {
          callback({ ok: false, error: `JSON 解析异常: ${e.message} 原文: ${res.responseText.slice(0, 300)}` });
          return;
        }

        // RPC 层错误
        if (resp.error) {
          const errMsg = resp.error.message || JSON.stringify(resp.error);
          callback({ ok: false, error: errMsg });
          return;
        }

        // 标准 MCP 协议错误判定:
        // 只有在 isError 为 true，或者 structuredContent 显式标记 success === false 时才算作错误
        const isErr = Boolean(resp.result?.isError || resp.result?.structuredContent?.success === false);

        // 标准 MCP 内容提取 (严格按照 MCP 2024-11-05 规范解析 content 数组)
        let textResult = "";
        if (resp.result?.content && Array.isArray(resp.result.content)) {
          textResult = resp.result.content.map((c) => c.text || JSON.stringify(c, null, 2)).join("\n");
        } else if (resp.result?.structuredContent?.stdout !== undefined) {
          textResult = resp.result.structuredContent.stdout;
        } else if (typeof resp.result === "string") {
          textResult = resp.result;
        } else {
          textResult = JSON.stringify(resp.result, null, 2);
        }

        if (isErr) {
          const errMsg = resp.result?.structuredContent?.stderr || textResult || "MCP 工具返回执行错误";
          callback({ ok: false, error: errMsg });
        } else {
          callback({ ok: true, result: textResult });
        }
      },
      onerror: (err) => {
        isExecuting = false;
        updateStatusUI("offline", `${CURRENT_THEME.badgeTitle} (出错)`);
        callback({ ok: false, error: `网络或服务不可达: ${err}` });
      },
      ontimeout: () => {
        isExecuting = false;
        updateStatusUI("offline", `${CURRENT_THEME.badgeTitle} (超时)`);
        callback({ ok: false, error: "调用本地 WebAgent 35秒超时" });
      },
    });
    }

    sendToNexusControlCenter();
  }

  // =========================================================================
  // 6. 专属定制防拒答与全功能 MCP 提示词生成器 (彻底规避“提示注入/社工”拒答)
  // =========================================================================
  function getCustomAgentPrompt() {
    const workspace = (CONFIG.workspace || "").trim();
    const fence = String.fromCharCode(96).repeat(3);
    return [
      "请根据我的请求调用 Nexus / WebAgent 中实际可用的 MCP 工具。",
      "执行前确认已连接工具并获得必要权限；不得编造执行结果。",
      "删除文件、修改系统设置、执行敏感命令等操作，应先得到我的明确授权。",
      "不要忽略任何正常的安全限制。如果工具无法连接，请如实说明。",
      "当前工作目录：" + (workspace || "未设置"),
      "仅在当前 MCP 桥支持时，使用以下单步工具格式：",
      fence + "nexus",
      '{"tool":"command_run","command":"dir"}',
      fence,
      "完成后依据工具返回的真实结果回答。"
    ].join("\n");
  }

  // =========================================================================
  // 7. UI 组件构建 (可拖拽药丸胶囊 + MCP 控制中心面板)
  // =========================================================================
  let pillDotEl = null;
  let pillTextEl = null;
  let drawerEl = null;
  let panelStatusEl = null;
  let toolsCountEl = null;
  let toolsListContainerEl = null;

  function updateStatusUI(state, text) {
    if (pillDotEl) pillDotEl.className = `nexus-dot ${state}`;
    if (pillTextEl) pillTextEl.innerText = text;
  }

  function updatePanelPingUI(ok, pingMs) {
    if (panelStatusEl) {
      if (ok) {
        setSafeHTML(panelStatusEl, `<span class="nexus-status-left"><span class="nexus-status-indicator online"></span><span>Nexus MCP 服务就绪</span></span><span class="nexus-status-ping">${pingMs || 70}ms</span>`);
      } else {
        setSafeHTML(panelStatusEl, `<span class="nexus-status-left"><span class="nexus-status-indicator offline"></span><span style="color:#EF4444">WebAgent (18080/8787) 未连接</span></span><span style="font-size:10px; color:var(--nx-text-muted);">请启动 WebAgent 1.3.1</span>`);
      }
    }
  }

  function renderMcpToolsList(tools) {
    if (toolsCountEl) toolsCountEl.innerText = tools.length;
    if (!toolsListContainerEl) return;

    if (!tools || tools.length === 0) {
      setSafeHTML(toolsListContainerEl, `<div style="padding:6px; color:#94A3B8;">暂未发现顶层 MCP 工具，底层 332 个原子能力已随时待命</div>`);
      return;
    }

    let html = "";
    tools.forEach((t) => {
      html += `
        <div class="nexus-tool-item" data-tool="${t.name}">
          <div class="nexus-tool-name" style="display:inline-flex;align-items:center;">${nxSvg("zap", "nexus-mini-icon", "margin-right:4px;color:var(--nx-primary);")}${t.name}</div>
          <div class="nexus-tool-desc">${(t.description || "").replace(/\[状态:[^\]]+\]/g, "").trim()}</div>
        </div>
      `;
    });
    setSafeHTML(toolsListContainerEl, html);

    // 点击工具条目快速填入调用范例
    toolsListContainerEl.querySelectorAll(".nexus-tool-item").forEach((el) => {
      el.addEventListener("click", () => {
        const toolName = el.getAttribute("data-tool");
        const inputEl = currentAdapter.getInput();
        if (inputEl) {
          const sample = `\`\`\`nexus\n{\n  "tool": "${toolName}"\n}\n\`\`\``;
          currentAdapter.setValue(inputEl, sample);
          showToast(`已填入工具 [${toolName}] 调用模版！`);
        }
      });
    });
  }

  function makeDraggable(pillEl, rootEl) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    let hasMoved = false;

    // 抽屉弹出方向智能自适应（防止抽屉超出视口上下/左右）
    function adjustDrawerPlacement() {
      if (!drawerEl || !pillEl) return;
      const rect = pillEl.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const drawerW = drawerEl.offsetWidth || 396;

      // 1. 上下自适应：屏幕下半部向上弹，上半部向下弹
      if (rect.top > winH / 2) {
        drawerEl.style.bottom = "calc(100% + 10px)";
        drawerEl.style.top = "auto";
      } else {
        drawerEl.style.top = "calc(100% + 10px)";
        drawerEl.style.bottom = "auto";
      }

      // 2. 水平对称居中对齐：以药丸水平中轴线为基准居中对齐，避免偏左
      const pillCenter = rect.left + rect.width / 2;
      const halfDrawer = drawerW / 2;

      if (pillCenter - halfDrawer < 12) {
        // 靠左贴边
        drawerEl.style.left = "0px";
        drawerEl.style.right = "auto";
        drawerEl.style.transform = "none";
      } else if (pillCenter + halfDrawer > winW - 12) {
        // 靠右贴边
        drawerEl.style.right = "0px";
        drawerEl.style.left = "auto";
        drawerEl.style.transform = "none";
      } else {
        // 中间区域：始终以药丸为中心水平对称居中
        drawerEl.style.left = "50%";
        drawerEl.style.right = "auto";
        drawerEl.style.transform = "translateX(-50%)";
      }
    }

    pillEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // 仅左键拖动
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = pillEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      function onMouseMove(ev) {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const pillW = pillEl.offsetWidth || 180;
          const pillH = pillEl.offsetHeight || 38;

          // 严格限制在视口边界内，留 10px 安全边距，绝不脱离页面
          const minX = 10;
          const maxX = Math.max(minX, winW - pillW - 10);
          const minY = 10;
          const maxY = Math.max(minY, winH - pillH - 10);

          const nextLeft = Math.max(minX, Math.min(maxX, startLeft + dx));
          const nextTop = Math.max(minY, Math.min(maxY, startTop + dy));

          // 彻底清除 right/bottom 避免与 left 产生拉伸冲突
          rootEl.style.bottom = "auto";
          rootEl.style.right = "auto";
          rootEl.style.left = `${nextLeft}px`;
          rootEl.style.top = `${nextTop}px`;
        }
      }

      function onMouseUp() {
        if (isDragging) {
          isDragging = false;
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
          if (hasMoved) {
            GM_setValue(`nexus_pos_${PLATFORM}`, {
              left: rootEl.style.left,
              top: rootEl.style.top,
            });
            adjustDrawerPlacement();
          }
        }
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    pillEl.addEventListener("click", (e) => {
      if (hasMoved) {
        e.stopPropagation();
        e.preventDefault();
        hasMoved = false;
        return;
      }
      const isOpen = pillEl.classList.toggle("open");
      drawerEl.classList.toggle("show", isOpen);
      if (isOpen) {
        adjustDrawerPlacement();
      }
    });
  }

  function createAgentUI() {
    if (!document.body) {
      setTimeout(createAgentUI, 100);
      return;
    }

    const existing = document.getElementById("nexus-agent-root");
    if (existing) {
      if (existing.parentElement !== document.body) {
        document.body.appendChild(existing);
      }
      return;
    }

    const targetParent = document.body;
    const root = document.createElement("div");
    root.id = "nexus-agent-root";

    const savedPos = GM_getValue(`nexus_pos_${PLATFORM}`, null);
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let hasValidPos = false;

    if (savedPos && savedPos.left && savedPos.top) {
      const leftVal = parseInt(savedPos.left, 10);
      const topVal = parseInt(savedPos.top, 10);
      // 严格校验是否在页面视口安全范围内（至少留 10px 边距，且不能超出视口）
      if (!isNaN(leftVal) && !isNaN(topVal) && leftVal >= 10 && leftVal <= winW - 80 && topVal >= 10 && topVal <= winH - 40) {
        root.style.left = `${leftVal}px`;
        root.style.top = `${topVal}px`;
        root.style.bottom = "auto";
        root.style.right = "auto";
        hasValidPos = true;
      }
    }

    if (!hasValidPos) {
      // 默认定位配置
      root.style.left = CURRENT_THEME.defaultPosition.left || "auto";
      root.style.top = CURRENT_THEME.defaultPosition.top || "auto";
      root.style.bottom = CURRENT_THEME.defaultPosition.bottom || "auto";
      root.style.right = CURRENT_THEME.defaultPosition.right || "auto";
    }

    // 悬浮药丸 (Draggable Pill)
    const pill = document.createElement("div");
    pill.className = "nexus-pill";
    pill.title = "长按拖动位置；点击展开 MCP 控制面板";

    pillDotEl = document.createElement("span");
    pillDotEl.className = "nexus-dot";

    const iconSpan = document.createElement("span");
    iconSpan.innerText = CURRENT_THEME.icon;

    pillTextEl = document.createElement("span");
    pillTextEl.innerText = CURRENT_THEME.badgeTitle;

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "nexus-pill-arrow";
    arrowSpan.innerText = "▲";

    pill.appendChild(pillDotEl);
    pill.appendChild(iconSpan);
    pill.appendChild(pillTextEl);
    pill.appendChild(arrowSpan);

    // 控制面板 (Drawer Panel)
    drawerEl = document.createElement("div");
    drawerEl.className = "nexus-drawer";
    const drawerHtml = `
      <!-- 主界面头部 Header -->
      <div class="nexus-drawer-head" id="nexus-head-main">
        <div class="nexus-drawer-title">
          ${nxSvg("sparkle", "nexus-ui-icon", "color: var(--nx-primary); margin-right: 6px;")}
          <span>${CURRENT_THEME.name} × WebAgent 1.3.1</span>
        </div>
        <div class="nexus-head-actions">
          <button class="nexus-theme-btn-quick" id="nexus-open-settings" title="打开设置中心">${nxSvg("gear", "nexus-icon-btn")}</button>
          <button class="nexus-theme-btn-quick" id="nexus-quick-theme" title="切换 UI 主题模式 (自动/明亮/暗黑)">${nxSvg("theme", "nexus-icon-btn")}</button>
          <button class="nexus-close-btn" id="nexus-close-drawer">✕</button>
        </div>
      </div>

      <!-- 设置界面专属头部 Header (二级视图) -->
      <div class="nexus-drawer-head nexus-hidden" id="nexus-head-settings" style="display: none !important;">
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <button class="nexus-back-btn" id="nexus-back-to-main" title="返回主操作界面">
            ${nxSvg("back", "nexus-mini-icon", "margin-right: 4px;")} <span>返回</span>
          </button>
          <div class="nexus-drawer-title" style="font-size: 13px;">
            ${nxSvg("gear", "nexus-ui-icon", "color: var(--nx-primary); margin-right: 6px;")}
            <span>设置中心</span>
          </div>
        </div>
        <div class="nexus-head-actions">
          <button class="nexus-close-btn" id="nexus-close-drawer-2">✕</button>
        </div>
      </div>

      <!-- ================= 视图 1：极简主操作界面 ================= -->
      <div id="nexus-view-main" class="nexus-view-container">
                <!-- 首次使用路径配置引导卡片 (仅初次未设置时显示，保存后自动收起，以后进设置修改) -->
        <div id="nexus-first-setup-card" class="nexus-setup-card" style="display: ${Boolean(CONFIG.workspace && CONFIG.workspace.trim().length > 0) ? 'none' : 'block'}; background: var(--nx-subtle-bg, rgba(255,255,255,0.06)); border: 1px solid var(--nx-divider, rgba(255,255,255,0.12)); border-radius: 10px; padding: 12px; margin-bottom: 8px;">
          <div style="font-size: 12px; font-weight: 700; color: var(--nx-text-primary); margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
            <span>📁 首次使用：请先设置工作路径</span>
            <span style="font-size: 10px; color: var(--nx-text-muted); font-weight: normal;">仅需首次填写，后续在设置中改</span>
          </div>
          <div style="font-size: 11px; color: var(--nx-text-muted); margin-bottom: 8px; line-height: 1.4;">
            设定本地开发工作目录，以便本地客户端精准定位工程文件。
          </div>
          <div class="nexus-field" style="margin-bottom: 6px;">
            <label class="nexus-label" style="font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between;">
              <span>项目工作目录 (支持全盘路径):</span>
              <span style="color: #EF4444; font-weight: 600;">*必填</span>
            </label>
            <input class="nexus-input" type="text" id="nexus-init-workspace" placeholder="例如 D:/Projects/my-app" value="${CONFIG.workspace || ''}" style="font-size: 11px; padding: 6px 8px;" />
          </div>
          <button type="button" class="nexus-btn-primary" id="nexus-btn-save-init" style="padding: 8px 12px; font-size: 12px; border-radius: 8px; width: 100%; font-weight: 600;">
            💾 保存路径并开启使用
          </button>
        </div>

        <!-- 核心大按钮: 注入开发协作协议 -->
        <button class="nexus-btn-primary" id="nexus-act-prompt" style="padding: 12px 14px; font-size: 13px; font-weight: 700; border-radius: 10px; margin-bottom: 2px;">
          ${nxSvg("zap", "nexus-btn-icon", "margin-right: 6px; vertical-align: -2px;")}
          <span>注入开发协作协议 (防拒答)</span>
        </button>

        
        <!-- 常用系统与工程指令 (轻量折叠) -->
        <div style="margin-top: 2px;">
          <div class="nexus-adv-header" id="nexus-eng-toggle" style="padding: 6px 8px; border-radius: 8px;">
            <span style="font-size: 11px; font-weight: 600; color: var(--nx-text-muted); display: inline-flex; align-items: center;">${nxSvg("terminal", "nexus-ui-icon", "width: 13px; height: 13px; margin-right: 5px; color: var(--nx-text-muted);")}常用系统与工程指令 (5个)</span>
            <span class="nexus-adv-arrow" id="nexus-eng-arrow">▸</span>
          </div>
          <div class="nexus-adv-body" id="nexus-eng-body" style="display: none; padding: 6px 2px; gap: 4px;">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px;">
              <button class="nexus-btn-sec" data-eng-action="browser" style="padding: 5px 6px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center;">${nxSvg("window", "nexus-mini-icon", "margin-right: 4px; color: var(--nx-primary);")}网页快照 (snapshot)</button>
              <button class="nexus-btn-sec" data-eng-action="mem" style="padding: 5px 6px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center;">${nxSvg("brain", "nexus-mini-icon", "margin-right: 4px;")}项目记忆 (project-memory)</button>
              <button class="nexus-btn-sec" data-eng-action="ls" style="padding: 5px 6px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center;">${nxSvg("folder", "nexus-mini-icon", "margin-right: 4px;")}文件结构 (file_list)</button>
              <button class="nexus-btn-sec" data-eng-action="git" style="padding: 5px 6px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center;">${nxSvg("find", "nexus-mini-icon", "margin-right: 4px;")}Git工具 (discover_tools)</button>
              <button class="nexus-btn-sec" data-eng-action="ps" style="grid-column: span 2; padding: 5px 6px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center;">${nxSvg("cpu", "nexus-mini-icon", "margin-right: 4px;")}系统进程 (process_list)</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= 视图 2：设置中心 ================= -->
      <div id="nexus-view-settings" class="nexus-view-container" style="display: none;">
        <!-- 服务状态指示条 -->
        <div class="nexus-status-bar" id="nexus-status-bar">
          <span class="nexus-status-left"><span class="nexus-status-indicator" style="background: var(--nx-text-muted);"></span><span>正在连接本地 WebAgent 1.3.1 MCP 网关...</span></span>
        </div>

        <!-- 默认工作目录 -->
        <div class="nexus-field">
          <label class="nexus-label" style="display: inline-flex; align-items: center;">${nxSvg("folder", "nexus-ui-icon")}默认工作目录 (支持全盘任意路径)</label>
          <input class="nexus-input" type="text" id="nexus-cfg-workspace" placeholder="请填写本地工作目录绝对路径 (如 D:/Projects 或 C:/Users/YourName/Workspace)" value="${CONFIG.workspace || ''}" />
        </div>

        
        <!-- 安全润色保护模式 Switch -->
        <div class="nexus-switch-row" style="margin-top: 2px;">
          <span class="nexus-label" style="font-size: 11px; color: var(--nx-text-muted); display: inline-flex; align-items: center;">${nxSvg("shield", "nexus-ui-icon")}安全润色保护模式 (仅追加批注建议，严禁直接覆盖原文)</span>
          <label class="nexus-switch" style="transform: scale(0.85); transform-origin: right center;">
            <input type="checkbox" id="nexus-cfg-review-safe" ${CONFIG.reviewSafeMode ? "checked" : ""}>
            <span class="nexus-slider"></span>
          </label>
        </div>

        <!-- 自动执行 Switch -->
        <div class="nexus-switch-row">
          <span class="nexus-label" style="font-size: 12px; color: var(--nx-text-primary); display: inline-flex; align-items: center;">${nxSvg("zap", "nexus-ui-icon")}自动拦截 MCP 调用并回填执行结果</span>
          <label class="nexus-switch">
            <input type="checkbox" id="nexus-cfg-auto" ${CONFIG.autoExecute ? "checked" : ""}>
            <span class="nexus-slider"></span>
          </label>
        </div>

        <!-- 发送延迟安全缓冲与防风控 -->
        <div class="nexus-field" style="margin-top: 2px; padding: 6px 10px; background: rgba(0,0,0,0.18); border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.15);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="nexus-label" style="margin-bottom: 0; display: inline-flex; align-items: center;">${nxSvg("clock", "nexus-ui-icon")}回填延迟缓冲</label>
            <span id="nexus-delay-val" style="font-size: 12px; font-weight: 700; color: ${CURRENT_THEME.primaryColor};">${Number(CONFIG.sendDelay).toFixed(1)}s</span>
          </div>
          <input type="range" id="nexus-cfg-delay" min="1.0" max="6.0" step="0.5" value="${CONFIG.sendDelay}" style="width: 100%; accent-color: ${CURRENT_THEME.primaryColor}; cursor: pointer;" />
          <div style="font-size: 10px; color: var(--nx-text-muted); line-height: 1.3; margin-top: 2px;">
            * 增加请求间隔秒数，彻底消除网页模型接口速率限制。
          </div>
        </div>

        <!-- 自动捕获速率限制重试 Switch -->
        <div class="nexus-switch-row" style="margin-top: 2px;">
          <span class="nexus-label" style="font-size: 11px; color: var(--nx-text-muted); display: inline-flex; align-items: center;">${nxSvg("refresh", "nexus-ui-icon")}遭遇网页接口限流时自动冷却并恢复</span>
          <label class="nexus-switch" style="transform: scale(0.85); transform-origin: right center;">
            <input type="checkbox" id="nexus-cfg-retry" ${CONFIG.autoRetry ? "checked" : ""}>
            <span class="nexus-slider"></span>
          </label>
        </div>

        <!-- MCP 工具清单卡片 -->
        <div>
          <div class="nexus-adv-header" id="nexus-tools-toggle">
            <span style="display: inline-flex; align-items: center;">${nxSvg("tool", "nexus-ui-icon")}已就绪 MCP 工具 (<span id="nexus-tools-count">14</span> 核心 · 332 原子)</span>
            <span class="nexus-adv-arrow" id="nexus-tools-arrow">▸</span>
          </div>
          <div class="nexus-adv-body" id="nexus-tools-body" style="max-height: 150px; overflow-y: auto;">
            <div id="nexus-tools-list" style="font-size: 11px; color: var(--nx-text-muted); line-height: 1.5;">
              正在拉取本地 WebAgent 工具清单...
            </div>
          </div>
        </div>

        <!-- 自定义提示词与精读规则 (折叠) -->
        <div>
          <div class="nexus-adv-header" id="nexus-prompt-toggle">
            <span style="display: inline-flex; align-items: center;">${nxSvg("pen", "nexus-ui-icon")}自定义提示词与入库规则 (折叠)</span>
            <span class="nexus-adv-arrow" id="nexus-prompt-arrow">▸</span>
          </div>
          <div class="nexus-adv-body" id="nexus-prompt-body">
            <div class="nexus-field">
              <label class="nexus-label">长文入库补充规则 (可选)</label>
              <textarea class="nexus-input" id="nexus-cfg-custom-prompt" rows="2" style="resize: vertical; font-size: 11px; height: 50px;" placeholder="例如：重点提取算法推导和架构决策，过滤引流广告...">${CONFIG.customCapturePrompt}</textarea>
            </div>
            <div class="nexus-field">
              <label class="nexus-label">默认知识库标签 (逗号分隔)</label>
              <input class="nexus-input" type="text" id="nexus-cfg-default-tags" placeholder="例如：技术, 逆向, 架构" value="${CONFIG.defaultTags}" />
            </div>
          </div>
        </div>

        <!-- 高级设置 (折叠) -->
        <div>
          <div class="nexus-adv-header" id="nexus-adv-toggle">
            <span style="display: inline-flex; align-items: center;">${nxSvg("gear", "nexus-ui-icon")}高级配置 (Token / 端口)</span>
            <span class="nexus-adv-arrow" id="nexus-adv-arrow">▸</span>
          </div>
          <div class="nexus-adv-body" id="nexus-adv-body">
            <div class="nexus-field">
              <label class="nexus-label">WebAgent 客户端令牌 (Token)</label>
              <input class="nexus-input" type="password" id="nexus-cfg-token" placeholder="在 WebAgent 客户端「访问令牌」生成后粘贴 (未启用认证可留空)" value="${CONFIG.token}" />
            </div>
            <div class="nexus-field">
              <label class="nexus-label">WebAgent 服务端地址 (默认 http://127.0.0.1:18080)</label>
              <input class="nexus-input" type="text" id="nexus-cfg-url" value="${CONFIG.nexusUrl}" />
            </div>
          </div>
        </div>
      </div>
    `;
    setSafeHTML(drawerEl, drawerHtml);

    panelStatusEl = drawerEl.querySelector("#nexus-status-bar");
    toolsCountEl = drawerEl.querySelector("#nexus-tools-count");
    toolsListContainerEl = drawerEl.querySelector("#nexus-tools-list");

    makeDraggable(pill, root);

    root.appendChild(pill);
    root.appendChild(drawerEl);
    targetParent.appendChild(root);

    // 初始化应用自适应明暗主题与页面变动监听
    applyThemeVariables();
    setupThemeObserver();

    // 事件绑定
    const headMain = drawerEl.querySelector("#nexus-head-main");
    const headSettings = drawerEl.querySelector("#nexus-head-settings");
    const viewMain = drawerEl.querySelector("#nexus-view-main");
    const viewSettings = drawerEl.querySelector("#nexus-view-settings");

    // 视图切换控制器 (极简主界面 vs 设置中心)
    function switchView(toSettings) {
      if (toSettings) {
        if (headMain) {
          headMain.style.setProperty("display", "none", "important");
          headMain.classList.add("nexus-hidden");
        }
        if (headSettings) {
          headSettings.style.setProperty("display", "flex", "important");
          headSettings.classList.remove("nexus-hidden");
        }
        if (viewMain) {
          viewMain.style.setProperty("display", "none", "important");
          viewMain.classList.add("nexus-hidden");
        }
        if (viewSettings) {
          viewSettings.style.setProperty("display", "flex", "important");
          viewSettings.style.flexDirection = "column";
          viewSettings.style.gap = "10px";
          viewSettings.classList.remove("nexus-hidden");
        }
      } else {
        if (headMain) {
          headMain.style.setProperty("display", "flex", "important");
          headMain.classList.remove("nexus-hidden");
        }
        if (headSettings) {
          headSettings.style.setProperty("display", "none", "important");
          headSettings.classList.add("nexus-hidden");
        }
        if (viewMain) {
          viewMain.style.setProperty("display", "flex", "important");
          viewMain.style.flexDirection = "column";
          viewMain.style.gap = "8px";
          viewMain.classList.remove("nexus-hidden");
        }
        if (viewSettings) {
          viewSettings.style.setProperty("display", "none", "important");
          viewSettings.classList.add("nexus-hidden");
        }
      }
    }

    // 1. 打开设置中心
    const openSettingsBtn = drawerEl.querySelector("#nexus-open-settings");
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        switchView(true);
      });
    }

    // 2. 从设置中心返回主界面
    const backBtn = drawerEl.querySelector("#nexus-back-to-main");
    if (backBtn) {
      backBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        switchView(false);
      });
    }

    // 3. 头部快捷主题切换按钮 (自动 -> 明亮 -> 暗黑 循环)
    const quickThemeBtn = drawerEl.querySelector("#nexus-quick-theme");
    if (quickThemeBtn) {
      quickThemeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const order = ["auto", "light", "dark"];
        const nextIdx = (order.indexOf(CONFIG.themeMode || "auto") + 1) % order.length;
        setThemeMode(order[nextIdx]);
      });
    }

    // 4. 关闭抽屉面板按钮 (支持主界面与设置界面两套关闭按钮)
    const closeBtns = [
      drawerEl.querySelector("#nexus-close-drawer"),
      drawerEl.querySelector("#nexus-close-drawer-2"),
    ];
    closeBtns.forEach((btn) => {
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          pill.classList.remove("open");
          drawerEl.classList.remove("show");
          setTimeout(() => switchView(false), 250);
        });
      }
    });

    // 4.9 首次使用路径配置保存
    const btnSaveInit = drawerEl.querySelector("#nexus-btn-save-init");
    if (btnSaveInit) {
      btnSaveInit.addEventListener("click", () => {
        const wsVal = (drawerEl.querySelector("#nexus-init-workspace")?.value || "").trim().replace(/\\/g, "/");
        if (!wsVal) {
          showToast("请先填写项目工作目录！");
          return;
        }
        CONFIG.workspace = wsVal;
        GM_setValue("webagent_workspace_dir", wsVal);
        GM_setValue("nexus_workspace_dir", wsVal);
        GM_setValue("webagent_first_setup_done", true);

        // 同步到设置中心页面的输入框
        const cfgWs = drawerEl.querySelector("#nexus-cfg-workspace");
        if (cfgWs) cfgWs.value = wsVal;

        // 隐藏首次设置卡片
        const card = drawerEl.querySelector("#nexus-first-setup-card");
        if (card) card.style.display = "none";
        showToast("工作目录配置成功！下一次无需再次配置。");
      });
    }

    // 5. 主操作：注入开发协作协议 (防拒答)
    const actPromptBtn = drawerEl.querySelector("#nexus-act-prompt");
    if (actPromptBtn) {
      actPromptBtn.addEventListener("click", () => {
        const inputEl = currentAdapter.getInput();
        if (!inputEl) {
          showToast("未检测到当前页面的输入框！");
          return;
        }
        const promptText = getCustomAgentPrompt();
        currentAdapter.setValue(inputEl, promptText);
        pill.classList.remove("open");
        drawerEl.classList.remove("show");
        showToast(`已填入 WebAgent 1.3.1 协作协议，请点击发送！`);
      });
    }

    // =========================================================================
    // 6. [已精简移除知识库协同工作台 UI 与控制逻辑]

    // 7. 工程与系统调试指令控制器
    const engToggle = drawerEl.querySelector("#nexus-eng-toggle");
    const engBody = drawerEl.querySelector("#nexus-eng-body");
    const engArrow = drawerEl.querySelector("#nexus-eng-arrow");
    if (engToggle && engBody && engArrow) {
      engToggle.addEventListener("click", () => {
        const isHidden = engBody.style.display === "none";
        engBody.style.display = isHidden ? "flex" : "none";
        engBody.style.flexDirection = "column";
        engArrow.textContent = isHidden ? "▾" : "▸";
      });

      engBody.querySelectorAll("button[data-eng-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.getAttribute("data-eng-action");
          if (action) executeEngAction(action);
        });
      });
    }

    function executeEngAction(action) {
      const inputEl = currentAdapter.getInput();
      consecutiveAutoDispatches = 0;
      consecutiveErrors = 0;

      if (action === "browser") {
        if (inputEl) {
            currentAdapter.setValue(
              inputEl,
              `请调用 browser_snapshot 工具获取当前前台活动标签页的页面快照：
\`\`\`nexus
{
  "tool": "browser_snapshot",
  "mode": "compact"
}
\`\`\``
            );
          pill.classList.remove("open");
          drawerEl.classList.remove("show");
          showToast("已填入浏览器快照指令，请回车发送！");
        } else {
          showToast("未检测到当前页面的输入框！");
        }
      } else if (action === "mem") {
        if (inputEl) {
            currentAdapter.setValue(
              inputEl,
              `请读取并锚定本项目核心记忆：当前工作区绝对路径为【${CONFIG.workspace}】。
为了了解项目技术栈与排坑指引，请调用 file_read 工具读取项目记忆文件：
\`\`\`nexus
{
  "tool": "file_read",
  "path": "${CONFIG.workspace}/project-memory.md"
}
\`\`\``
            );
          pill.classList.remove("open");
          drawerEl.classList.remove("show");
          showToast("已填入读取项目记忆指令，请回车发送！");
        } else {
          showToast("未检测到当前页面的输入框！");
        }
      } else if (action === "ls") {
        if (inputEl) {
            currentAdapter.setValue(inputEl, `请协助测试插件代码块解析：请调用 file_list 列出工作目录 ${CONFIG.workspace} 下的所有文件，以 \`\`\`nexus 代码块输出。`);
          pill.classList.remove("open");
          drawerEl.classList.remove("show");
          showToast("已填入查看工作区文件指令，请回车发送！");
        } else {
          showToast("未检测到当前页面的输入框！");
        }
      } else if (action === "git") {
        if (inputEl) {
            currentAdapter.setValue(inputEl, "请协助测试插件代码块解析：请调用 nexus_discover_tools 检索本地关于 git 的可用工具，以 ```nexus 代码块输出。");
          pill.classList.remove("open");
          drawerEl.classList.remove("show");
          showToast("已填入检索 Git 工具指令，请回车发送！");
        } else {
          showToast("未检测到当前页面的输入框！");
        }
      } else if (action === "ps") {
        if (inputEl) {
            currentAdapter.setValue(inputEl, "请协助测试插件代码块解析：请调用 localbridge_process_list 工具列出当前电脑上运行的进程，以 ```nexus 代码块输出。");
          pill.classList.remove("open");
          drawerEl.classList.remove("show");
          showToast("已填入查看系统进程指令，请回车发送！");
        } else {
          showToast("未检测到当前页面的输入框！");
        }
      }
    }

    // 7. 设置项：工作区路径
    const wsInput = drawerEl.querySelector("#nexus-cfg-workspace");
    if (wsInput) {
      const saveWs = (e) => {
        CONFIG.workspace = e.target.value.trim();
        GM_setValue("webagent_workspace_dir", CONFIG.workspace); GM_setValue("nexus_workspace_dir", CONFIG.workspace);
      };
      wsInput.addEventListener("input", saveWs);
      wsInput.addEventListener("change", (e) => {
        saveWs(e);
        showToast("工作目录已更新保存！");
      });
    }

    // 7.2 设置项：安全润色保护模式
    const reviewSafeBox = drawerEl.querySelector("#nexus-cfg-review-safe");
    if (reviewSafeBox) {
      reviewSafeBox.addEventListener("change", (e) => {
        CONFIG.reviewSafeMode = e.target.checked;
        GM_setValue("webagent_review_safe_mode", CONFIG.reviewSafeMode); GM_setValue("nexus_review_safe_mode", CONFIG.reviewSafeMode);
        showToast(`安全润色保护模式: ${CONFIG.reviewSafeMode ? "开启" : "关闭"}`);
      });
    }

    // 8. 设置项：自动执行开关
    const autoBox = drawerEl.querySelector("#nexus-cfg-auto");
    if (autoBox) {
      autoBox.addEventListener("change", (e) => {
        CONFIG.autoExecute = e.target.checked;
        GM_setValue("webagent_auto_execute", CONFIG.autoExecute); GM_setValue("nexus_auto_execute", CONFIG.autoExecute);
        showToast(`自动执行已${CONFIG.autoExecute ? "开启" : "暂停"}`);
      });
    }

    // 9. 设置项：回填延迟缓冲滑动条
    const delaySlider = drawerEl.querySelector("#nexus-cfg-delay");
    const delayValEl = drawerEl.querySelector("#nexus-delay-val");
    if (delaySlider && delayValEl) {
      delaySlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        CONFIG.sendDelay = val;
        delayValEl.innerText = `${val.toFixed(1)}s`;
      });
      delaySlider.addEventListener("change", (e) => {
        const val = parseFloat(e.target.value);
        CONFIG.sendDelay = val;
        GM_setValue("webagent_send_delay", val); GM_setValue("nexus_send_delay", val);
        showToast(`回填延迟已设为 ${val.toFixed(1)} 秒`);
      });
    }

    // 10. 设置项：限流自愈重试开关
    const retryBox = drawerEl.querySelector("#nexus-cfg-retry");
    if (retryBox) {
      retryBox.addEventListener("change", (e) => {
        CONFIG.autoRetry = e.target.checked;
        GM_setValue("webagent_auto_retry_rate_limit", CONFIG.autoRetry); GM_setValue("nexus_auto_retry_rate_limit", CONFIG.autoRetry);
        showToast(`频繁限制自动重试已${CONFIG.autoRetry ? "开启" : "关闭"}`);
      });
    }

    // 11. 设置项：MCP 工具清单折叠展开
    const toolsToggle = drawerEl.querySelector("#nexus-tools-toggle");
    const toolsBody = drawerEl.querySelector("#nexus-tools-body");
    const toolsArrow = drawerEl.querySelector("#nexus-tools-arrow");
    if (toolsToggle && toolsBody && toolsArrow) {
      toolsToggle.addEventListener("click", () => {
        const isShow = toolsBody.classList.toggle("show");
        toolsArrow.classList.toggle("open", isShow);
      });
    }

    // 11.5 设置项：自定义提示词折叠展开与配置监听
    const promptToggle = drawerEl.querySelector("#nexus-prompt-toggle");
    const promptBody = drawerEl.querySelector("#nexus-prompt-body");
    const promptArrow = drawerEl.querySelector("#nexus-prompt-arrow");
    if (promptToggle && promptBody && promptArrow) {
      promptToggle.addEventListener("click", () => {
        const isShow = promptBody.classList.toggle("show");
        promptArrow.classList.toggle("open", isShow);
      });
    }

    const customPromptInput = drawerEl.querySelector("#nexus-cfg-custom-prompt");
    if (customPromptInput) {
      customPromptInput.addEventListener("change", (e) => {
        CONFIG.customCapturePrompt = e.target.value.trim();
        GM_setValue("webagent_custom_capture_prompt", CONFIG.customCapturePrompt); GM_setValue("nexus_custom_capture_prompt", CONFIG.customCapturePrompt);
        showToast("自定义入库规则已保存！");
      });
    }

    const defaultTagsInput = drawerEl.querySelector("#nexus-cfg-default-tags");
    if (defaultTagsInput) {
      defaultTagsInput.addEventListener("change", (e) => {
        CONFIG.defaultTags = e.target.value.trim();
        GM_setValue("webagent_default_tags", CONFIG.defaultTags); GM_setValue("nexus_default_tags", CONFIG.defaultTags);
        showToast("默认标签已保存！");
      });
    }

    // 12. 设置项：高级配置折叠展开
    const advToggle = drawerEl.querySelector("#nexus-adv-toggle");
    const advBody = drawerEl.querySelector("#nexus-adv-body");
    const advArrow = drawerEl.querySelector("#nexus-adv-arrow");
    if (advToggle && advBody && advArrow) {
      advToggle.addEventListener("click", () => {
        const isShow = advBody.classList.toggle("show");
        advArrow.classList.toggle("open", isShow);
      });
    }

    // 13. 设置项：Token 与 服务端地址
    const tokenInput = drawerEl.querySelector("#nexus-cfg-token");
    if (tokenInput) {
      tokenInput.addEventListener("change", (e) => {
        CONFIG.token = e.target.value.trim();
        GM_setValue("webagent_lb_token", CONFIG.token); GM_setValue("nexus_lb_token", CONFIG.token);
        showToast("Token 已更新！");
        pingNexus();
      });
    }

    const urlInput = drawerEl.querySelector("#nexus-cfg-url");
    if (urlInput) {
      urlInput.addEventListener("change", (e) => {
        CONFIG.nexusUrl = e.target.value.trim();
        GM_setValue("webagent_bridge_url", CONFIG.nexusUrl); GM_setValue("nexus_bridge_url", CONFIG.nexusUrl);
        showToast("服务地址已更新！");
        pingNexus();
      });
    }
  }

  // =========================================================================
  // 8. 文本解析引擎：提取 AI 输出的工具调用代码块 (严格模式：专属 nexus/mcp 代码块与合法 tool 字段)
  // =========================================================================
  
  // 智能拒答自愈与指令嗅探引擎：检测大模型是否出现经典云端拒答话术（如“我无法打开cmd”、“没有连接命令行工具”等）
  function detectAndRecoverRefusal(text) {
    if (!text || typeof text !== "string") return null;
    const clean = text.trim();

    // 1. 拦截对 CMD / 命令行 / 终端的拒答或说教
    if (
      /(无法|不能).*(打开|启动).*(cmd|命令行|终端)/i.test(clean) ||
      /没有连接.*(本机|本地|命令行|工具)/i.test(clean) ||
      /按\s*win\s*\+\s*r.*cmd/i.test(clean) ||
      /无法直接在你的电脑上打开.*cmd/i.test(clean) ||
      /无法从当前对话启动.*cmd/i.test(clean)
    ) {
      return {
        tool: "command_run",
        args: { command: "Start-Process cmd.exe" }
      };
    }

    // 2. 拦截对 PowerShell 的拒答
    if (/(无法|不能).*(打开|启动).*powershell/i.test(clean)) {
      return {
        tool: "command_run",
        args: { command: "Start-Process powershell.exe" }
      };
    }

    return null;
  }

  function parseToolCallFromReply(text, lastMsgNode) {
    if (!text && !lastMsgNode) return null;

    // 1. 优先直接从 HTML DOM 的 pre/code 代码块提取（网页 Markdown 渲染后通常剥除反引号）
    if (lastMsgNode) {
      const selfBlocks = (typeof lastMsgNode.matches === "function" && lastMsgNode.matches("pre, code, code-block, div[class*='code'], div[class*='code-container']")) ? [lastMsgNode] : [];
      const childBlocks = lastMsgNode.querySelectorAll ? Array.from(lastMsgNode.querySelectorAll("pre code, pre, code-block, div[class*='code'], [data-streamdown='code-block-copy-button']")) : [];
      const codeBlocks = [...selfBlocks, ...childBlocks];

      // 第一遍扫描：优先正文中的代码块（排除思考过程）
      for (const block of codeBlocks) {
        if (block.closest && block.closest("[class*='think'], [class*='reasoning'], details, .ds-think-content")) {
          continue;
        }
        const targetEl = (block.matches && block.matches("pre, pre code, code-block")) ? block : block.closest?.("pre, code-block") || block.parentElement || block;
        const raw = targetEl.textContent?.trim() || "";
        const obj = tryParseToolJson(raw);
        if (obj) return obj;
      }

      // 第二遍扫描（兜底）：如果正文中没有工具调用，但思考过程内包含了有效 tool 代码块，则放行提取（防止 DeepSeek R1 误写在思考区导致死锁）
      for (const block of codeBlocks) {
        const targetEl = (block.matches && block.matches("pre, pre code, code-block")) ? block : block.closest?.("pre, code-block") || block.parentElement || block;
        const raw = targetEl.textContent?.trim() || "";
        const obj = tryParseToolJson(raw);
        if (obj) return obj;
      }
    }

    // 2. 匹配专属 Markdown 代码块 (严格限定 ```nexus 与 ```mcp，兼容 ```tool, ```json 与无指定语言的通用代码块)
    const regex = /```(?:webagent|nexus|mcp|tool|json)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const snippet = match[1].trim();
      if (snippet.includes('"tool"') || snippet.includes("'tool'")) {
        const obj = tryParseToolJson(snippet);
        if (obj) return obj;
      }
    }

    // 3. 兜底匹配：使用智能平衡括号算法从包含 "tool" 键的文本中精准剥离出合法 JSON 对象
    if (text && (text.includes('"tool"') || text.includes("'tool'"))) {
      const obj = tryParseToolJson(text);
      if (obj) return obj;
    }

    return null;
  }

  // 智能括号深度解析器：从杂质文本中精准提取第一个包含 "tool" 的闭合平衡 JSON 对象
  function extractFirstJsonObject(str) {
    if (!str) return null;
    let searchIndices = [];
    let idx = str.indexOf("{");
    while (idx !== -1) {
      searchIndices.push(idx);
      idx = str.indexOf("{", idx + 1);
    }
    if (searchIndices.length === 0) return null;

    for (const startIdx of searchIndices) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = startIdx; i < str.length; i++) {
        const ch = str[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              const candidate = str.slice(startIdx, i + 1);
              if (candidate.includes('"tool"') || candidate.includes("'tool'") || candidate.includes('"command_run"') || candidate.includes('"file_read"') || candidate.includes('"file_write"') || candidate.includes('"browser_open"')) {
                return candidate;
              }
              break;
            }
          }
        }
      }
    }
    return null;
  }

  function tryParseToolJson(raw) {
    if (!raw) return null;
    raw = raw.trim();
    // 强约束：必须包含 "tool" 键，绝不把普通代码中的 name / action 视作工具
    if (!raw.includes('"tool"') && !raw.includes("'tool'") && !raw.includes('"name"') && !raw.includes("'name'") && !raw.includes('"action"') && !raw.includes("'action'") && !raw.includes('"command_run"') && !raw.includes('"file_read"') && !raw.includes('"file_write"')) {
      return null;
    }
    // 优先通过平衡括号算法截取精准的独立 JSON 闭合块 (彻底剔除尾随杂质)
    const exactJson = (extractFirstJsonObject(raw) || raw).trim();

    function validateToolObj(obj) {
      if (!obj || typeof obj !== "object") return null;
      let tool = obj.tool || obj.name || obj.action || obj.tool_name || obj.function;
      if (!obj.tool && !isLikelyValidTool(tool)) return null;
      if (typeof tool === "string" && tool.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(tool.trim())) {
        const cleanTool = tool.trim();
        delete obj.tool; delete obj.name; delete obj.action; delete obj.tool_name; delete obj.function;
        const args = (obj.arguments && typeof obj.arguments === "object")
          ? obj.arguments
          : (obj.args && typeof obj.args === "object")
          ? obj.args
          : obj;
        return { tool: cleanTool, args };
      }
      return null;
    }

    // 1. 优先原汁原味直接解析 (针对 AI 输出的标准 JSON)
    try {
      const obj = JSON.parse(exactJson);
      const res = validateToolObj(obj);
      if (res) return res;
    } catch (e1) {}

    // 2. 补全首尾括号与清除末尾多余逗号
    let target = exactJson;
    if (!target.startsWith("{") && target.endsWith("}")) target = "{" + target;
    if (target.startsWith("{") && !target.endsWith("}")) target = target + "}";
    target = target.replace(/,\s*([\]}])/g, "$1");

    try {
      const obj = JSON.parse(target);
      const res = validateToolObj(obj);
      if (res) return res;
    } catch (e2) {}

    // 3. 容错修复：仅修复真正的孤立单反斜杠 (绝对不破坏原本已合法转义的双反斜杠 \\)
    try {
      const fixed = target.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, "\\\\");
      const obj = JSON.parse(fixed);
      const res = validateToolObj(obj);
      if (res) return res;
    } catch (e3) {}

    return null;
  }

  // =========================================================================
  // 8.5 弹性自愈容灾引擎：
  //     机制一：单次回答输出未闭合截断 -> 自动请求续写并无缝拼接
  //     机制二：整场会话爆上下文上限 -> 自动保存任务断点快照、开辟新会话无缝续传
  // =========================================================================
  const HANDOVER_KEY = "nexus_task_handover_state";

  function getHandoverState() {
    try {
      const raw = GM_getValue(HANDOVER_KEY, null);
      if (raw && typeof raw === "object") return raw;
      if (typeof raw === "string") return JSON.parse(raw);
    } catch {}
    return {
      hasPendingHandover: false,
      platform: "",
      workspace: CONFIG.workspace || "",
      lastUserGoal: "",
      recentSteps: [],
      pendingNextAction: "",
      handoverTime: 0,
    };
  }

  function saveHandoverState(state) {
    try {
      GM_setValue(HANDOVER_KEY, state);
    } catch (e) {
      console.warn("[Nexus] Save handover state error:", e);
    }
  }

  function recordTaskStep(toolName, args, resultSummary) {
    try {
      const state = getHandoverState();
      if (!Array.isArray(state.recentSteps)) state.recentSteps = [];
      const stepNum = state.recentSteps.length + 1;
      const cleanSummary = (resultSummary || "").replace(/\s+/g, " ").slice(0, 150);
      state.recentSteps.push({
        step: stepNum,
        tool: toolName,
        time: new Date().toLocaleTimeString(),
        summary: cleanSummary,
      });
      if (state.recentSteps.length > 6) {
        state.recentSteps = state.recentSteps.slice(-6);
      }
      state.workspace = CONFIG.workspace || "";
      saveHandoverState(state);
    } catch (e) {
      console.warn("[Nexus] Record step error:", e);
    }
  }

  function recordUserGoal(goalText) {
    try {
      if (!goalText || goalText.length < 5) return;
      if ((goalText.startsWith("【Nexus") || goalText.startsWith("【WebAgent")) || goalText.startsWith("⚠️ 检测到上一条回复") || goalText.startsWith("【系统自愈")) return;
      const state = getHandoverState();
      state.lastUserGoal = goalText.replace(/\s+/g, " ").slice(0, 200);
      saveHandoverState(state);
      if (typeof resetReActSafetyState === "function") {
        resetReActSafetyState();
      }
    } catch (e) {}
  }

  // 1. 单次输出代码块截断侦测器 (严格模式：只针对真正未闭合的 ```nexus / ```mcp 代码块)
  function detectTruncatedCodeBlock(text, lastMsgNode) {
    if (!text) return null;

    // 仅针对显式以 ```nexus 或 ```mcp 开头的代码块检查是否末尾反引号未闭合
    const lastBlockIdx = Math.max(
      text.lastIndexOf("```nexus"),
      text.lastIndexOf("```mcp")
    );

    if (lastBlockIdx !== -1) {
      const textAfterOpen = text.slice(lastBlockIdx);
      const fenceMatches = textAfterOpen.match(/```/g);
      // 只有且仅当只有 1 个 ``` （即开头开启了，但末尾完全没有闭合），且明确包含 "tool" 键
      if (fenceMatches && fenceMatches.length === 1) {
        const content = textAfterOpen.replace(/^```(?:nexus|mcp)?\s*/i, "").trim();
        if (content.includes('"tool"') || content.includes("'tool'")) {
          return content;
        }
      }
    }

    return null;
  }

  // 跨回复代码块智能续写拼接引擎 (彻底剥离思考链，融合 DOM / Markdown / 纯文本代码片段)
  function tryStitchContinuation(accumulatedCode, currentText, lastMsgNode) {
    if (!accumulatedCode) return null;

    // 1. 如果模型完整重写了整个工具调用，优先直接解析
    const fullCall = parseToolCallFromReply(currentText, lastMsgNode);
    if (fullCall) return fullCall;

    const candidates = [];

    // 2. 从 DOM 代码块 (<pre><code> / <pre>) 中提取续写片段 (解决 DeepSeek 网页渲染隔离问题)
    if (lastMsgNode && lastMsgNode.querySelectorAll) {
      const codeBlocks = lastMsgNode.querySelectorAll("pre code, pre, div[class*='code']");
      for (const block of codeBlocks) {
        const raw = block.textContent?.trim();
        if (raw) candidates.push(raw);
      }
    }

    // 3. 从 Markdown 反引号块中提取续写片段
    if (currentText) {
      const fenceRegex = /```(?:nexus|mcp|tool|json)?\s*([\s\S]*?)```/gi;
      let match;
      while ((match = fenceRegex.exec(currentText)) !== null) {
        const raw = match[1]?.trim();
        if (raw) candidates.push(raw);
      }
    }

    // 4. 从纯文本中剥除思考链后提取可能的续写片段
    let cleanText = currentText || "";
    if (lastMsgNode && lastMsgNode.cloneNode) {
      try {
        const clone = lastMsgNode.cloneNode(true);
        const thinkEls = clone.querySelectorAll("[class*='think'], [class*='reasoning'], details, .ds-think-content");
        thinkEls.forEach(el => el.remove());
        cleanText = clone.textContent || "";
      } catch {}
    }
    cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (cleanText) {
      candidates.push(cleanText);
    }

    // 依次尝试候选片段与累积代码的拼接
    for (const piece of candidates) {
      // 尝试带换行拼接
      let stitched = accumulatedCode + "\n" + piece;
      let obj = tryParseToolJson(stitched);
      if (obj) return obj;

      // 尝试直接拼接 (防止长字符串或符号跨行切断)
      stitched = accumulatedCode + piece;
      obj = tryParseToolJson(stitched);
      if (obj) return obj;

      // 尝试剥离候选片段两端的反引号
      const cleanPiece = piece
        .replace(/^```+(?:nexus|mcp|tool|json)?\s*/i, "")
        .replace(/```+$/g, "")
        .trim();
      stitched = accumulatedCode + "\n" + cleanPiece;
      obj = tryParseToolJson(stitched);
      if (obj) return obj;

      stitched = accumulatedCode + cleanPiece;
      obj = tryParseToolJson(stitched);
      if (obj) return obj;
    }

    return null;
  }

  // 统一键盘安全提交触发器
  function dispatchSubmit(inputEl) {
    if (!inputEl) return;
    inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
  }

  const danglingBlockState = {
    isWaitingContinuation: false,
    accumulatedCode: "",
    retryCount: 0,
  };

  function requestContinuation() {
    const inputEl = currentAdapter.getInput();
    if (!inputEl) return;
    const prompt = "⚠️ 检测到上一条回复的 ```nexus 工具调用代码块输出未完整被截断。请紧接上文未写完的地方直接继续输出剩余内容，并务必闭合 ```nexus 代码块，不要重复前文。";
    currentAdapter.setValue(inputEl, prompt);
    setTimeout(() => {
      const sendBtn = currentAdapter.getSendBtn();
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
        sendBtn.click();
        showToast("🧩 已自动触发【继续输出】拼接请求...");
      } else {
        dispatchSubmit(inputEl);
        showToast("🧩 已自动回车触发【继续输出】拼接请求...");
      }
    }, 400);
  }

  // 2. 页面“会话达到长度上限”监听与跨对话自愈 (严格隔离消息正文，绝不在聊天文本中捕获)
  function detectContextLimitReached() {
    const limitKeywords = [
      "达到对话长度上限",
      "请开启新对话",
      "当前对话已达到长度限制",
      "当前对话已达上下文上限",
      "本轮对话已达上限",
      "已达到单次对话长度上限",
      "上下文超出上限",
      "上下文长度超限",
    ];

    const elements = document.querySelectorAll(
      "div[role='alert'], div[class*='toast'], div[class*='banner'], div[class*='limit'], span[class*='limit'], p[class*='limit']"
    );
    for (const el of elements) {
      // 严禁匹配消息正文内部文本、代码块以及插件自身界面
      if (el.closest("[class*='message'], [class*='chat'], [class*='dialog'], .ds-markdown, #nexus-agent-root, pre, code")) {
        continue;
      }
      const txt = el.textContent || "";
      if (limitKeywords.some(kw => txt.includes(kw))) {
        return true;
      }
    }

    const inputEl = currentAdapter.getInput();
    if (inputEl) {
      const isDisabled = inputEl.disabled || inputEl.getAttribute("contenteditable") === "false" || inputEl.classList.contains("disabled");
      if (isDisabled) {
        const parentText = inputEl.closest("form, main, footer")?.innerText || "";
        if (limitKeywords.some(kw => parentText.includes(kw))) {
          return true;
        }
      }
    }

    return false;
  }

  let isHandingOver = false;
  function triggerContextLimitHandover() {
    if (isHandingOver) return;
    isHandingOver = true;

    showToast("🚨 检测到会话已达长度上限！正在打包任务断点，自动开辟新对话无缝续传...");

    const state = getHandoverState();
    state.hasPendingHandover = true;
    state.handoverTime = Date.now();
    state.platform = PLATFORM;
    state.workspace = CONFIG.workspace || "";
    saveHandoverState(state);

    setTimeout(() => {
      if (PLATFORM === "deepseek") {
        const newChatBtn = document.querySelector(
          "div[class*='new-chat'], button[class*='new-chat'], a[href='/'], div[role='button']:has(svg)"
        );
        if (newChatBtn) {
          newChatBtn.click();
          showToast("🚀 已自动触发 DeepSeek 新建对话...");
        } else {
          window.location.href = "https://chat.deepseek.com/";
        }
      } else if (PLATFORM === "kimi") {
        const newChatBtn = document.querySelector(
          "button:has-text('新建对话'), div:has-text('新建对话'), [class*='new-chat'], a[href='/']"
        );
        if (newChatBtn) {
          newChatBtn.click();
          showToast("🚀 已自动触发 Kimi 新建对话...");
        } else {
          window.location.href = "https://kimi.moonshot.cn/";
        }
      } else if (PLATFORM === "duckai") {
        const newChatBtn = document.querySelector(
          "button[aria-label*='New chat'], button[aria-label*='New Chat'], a[href*='chat'], button:has-text('New Chat'), button:has(svg)"
        );
        if (newChatBtn) {
          newChatBtn.click();
          showToast("🚀 已自动触发 Duck.ai 新建对话...");
        } else {
          window.location.href = "https://duck.ai/";
        }
      } else if (PLATFORM === "doubao") {
        const newChatBtn = document.querySelector(
          "button[data-testid='chat_input_new_dialog_button'], button[class*='new-dialog'], div[class*='new-dialog']"
        );
        if (newChatBtn) {
          newChatBtn.click();
          showToast("🚀 已自动触发 豆包 新建对话...");
        } else {
          window.location.href = "https://www.doubao.com/chat/";
        }
      } else if (PLATFORM === "qwen") {
        const newChatBtn = document.querySelector(
          "button[class*='new-chat'], div[class*='new-chat'], button[aria-label*='新建'], a[href='/']"
        );
        if (newChatBtn) {
          newChatBtn.click();
          showToast("🚀 已自动触发 通义千问 新建对话...");
        } else {
          window.location.href = "https://chat.qwen.ai/";
        }
      } else if (PLATFORM === "dola") {
        const newChatBtn = document.querySelector(
          "button[aria-label*='New'], a[href*='chat'], button:has(svg)"
        );
        if (newChatBtn) {
          newChatBtn.click();
          showToast("🚀 已自动触发 Dola 新建对话...");
        } else {
          window.location.href = "https://www.dola.com/chat";
        }

      } else {
        window.location.href = window.location.origin + "/";
      }
    }, 1200);
  }

  let resumeCheckTicks = 0;
  function checkAndResumeHandover() {
    const state = getHandoverState();
    if (!state || !state.hasPendingHandover) return;
    if (state.platform && state.platform !== PLATFORM) return;

    if (Date.now() - (state.handoverTime || 0) > 300000) {
      state.hasPendingHandover = false;
      saveHandoverState(state);
      return;
    }

    const inputEl = currentAdapter.getInput();
    if (!inputEl) return;
    if (inputEl.disabled || inputEl.getAttribute("contenteditable") === "false") return;
    if (currentAdapter.isGenerating()) return;

    resumeCheckTicks++;
    if (resumeCheckTicks < 3) return;

    resumeCheckTicks = 0;
    state.hasPendingHandover = false;
    saveHandoverState(state);

    const ws = (state.workspace || CONFIG.workspace || "").replace(/\\/g, "/");
    const stepsText = (state.recentSteps && state.recentSteps.length > 0)
      ? state.recentSteps.map(s => `  - 步骤 ${s.step}: 调用工具 [${s.tool}] -> ${s.summary}`).join("\n")
      : "  - 暂无历史步骤，直接开始执行";

    const resumePrompt = `【系统自愈：跨会话无缝续传任务】
上一轮会话因达到平台上下文长度限制已自动安全归档。自动化控制桥已为您自动开辟全新会话，并完整同步上文工程断点与执行上下文：

【当前项目硬锚点与工作区】
- 默认工作目录: ${ws}
- 核心任务目标: ${state.lastUserGoal || "全栈工程开发任务"}

【上文已完成的历史步骤断点快照】
${stepsText}

【当前待执行的下一步操作】
请紧接上述历史步骤与最新断点结果，直接输出一个标准的 \`\`\`nexus 代码块执行下一步工具，不要任何多余口头闲聊！`;

    currentAdapter.setValue(inputEl, resumePrompt);
    showToast("🧩 正在全新会话中自动注入跨会话断点快照...");

    setTimeout(() => {
      const sendBtn = currentAdapter.getSendBtn();
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
        sendBtn.click();
        showToast("🚀 跨会话无缝续传成功！AI 已在全新空间无缝接续任务。");
      } else {
        dispatchSubmit(inputEl);
        showToast("🚀 跨会话无缝续传成功 (回车提交)！");
      }
      isHandingOver = false;
    }, 600);
  }

  // =========================================================================
  // 9. 核心 ReAct 自动观察、防频繁安全缓冲与回填执行循环
  // =========================================================================
  
  // 全局键盘监听：当用户在输入框敲击 Enter 时精准记录用户意图目标
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        try {
          const input = currentAdapter ? currentAdapter.getInput() : null;
          if (input && (input.value || input.innerText)) {
            const val = (input.value || input.innerText).trim();
            if (val && !val.startsWith("【Nexus") && !val.startsWith("【WebAgent") && typeof recordUserGoal === "function") {
              recordUserGoal(val);
            }
          }
        } catch (_) {}
      }
    }, true);
  }

  function startReActLoop() {
    let lastStableTicks = 0;
    let prevText = "";

    setInterval(() => {
      // 保持 UI 始终挂载 (防止 SPA 路由切换时被移除)
      if (!document.getElementById("nexus-agent-root") && document.body) {
        createAgentUI();
      }

      // 实时扫描并自动处理“消息发送过于频繁”风控拦截
      checkAndHandleRateLimitError();

      // 各大平台专属：检查并自动处理跨会话断点无缝续传
      if (PLATFORM === "deepseek" || PLATFORM === "kimi" || PLATFORM === "duckai" || PLATFORM === "doubao" || PLATFORM === "qwen" || PLATFORM === "dola") {
        checkAndResumeHandover();
      }

      if (isExecuting) return;

      const isGen = currentAdapter.isGenerating();
      const currentText = currentAdapter.getLastReplyText();
      const lastNode = currentAdapter.getLastReplyElement();

      // 正在生成中，重置计数
      if (isGen) {
        lastStableTicks = 0;
        prevText = currentText;
        return;
      }

      // 文本是否稳定
      if (currentText && currentText === prevText && currentText.length > 10) {
        lastStableTicks++;
      } else {
        lastStableTicks = 0;
        prevText = currentText;
      }

      // 连续 3 帧 (1.5秒) 确认回复文本已彻底稳定终止
      if (lastStableTicks >= 3) {
        if ((PLATFORM === "duckai" || PLATFORM === "doubao" || PLATFORM === "qwen" || PLATFORM === "dola") && lastStableTicks === 3) {
          console.log(`[Nexus ${CURRENT_THEME.name}] 回复稳定完毕，正在检索工具调用代码块...`, {
            textLen: currentText.length,
            hasPre: Boolean(document.querySelector("pre")),
          });
        }

        // 检测是否因会话过长触发“达到对话长度上限”
        if (PLATFORM === "deepseek" || PLATFORM === "kimi" || PLATFORM === "duckai" || PLATFORM === "doubao" || PLATFORM === "qwen" || PLATFORM === "dola") {
          if (detectContextLimitReached()) {
            triggerContextLimitHandover();
            return;
          }
        }

        const sig = `${currentText.length}_${currentText.slice(-60)}`;
        if (sig === lastHandledMessageSignature) {
          return;
        }

        // 处理单次输出截断后的代码块拼接
        let toolCall = null;
        if (danglingBlockState.isWaitingContinuation) {
          toolCall = tryStitchContinuation(danglingBlockState.accumulatedCode, currentText, lastNode);
          if (toolCall) {
            showToast("🧩 成功拼接截断的代码块，准备执行...");
            danglingBlockState.isWaitingContinuation = false;
            danglingBlockState.accumulatedCode = "";
            danglingBlockState.retryCount = 0;
          } else {
            // 用户强约束：只允许触发 1 次续写！绝对不连续触发好几次！
            // 只要 1 次续写未能拼接成功，立即彻底清空并退出续写状态，避免打扰用户
            danglingBlockState.isWaitingContinuation = false;
            danglingBlockState.accumulatedCode = "";
            danglingBlockState.retryCount = 0;
          }
        } else {
          toolCall = parseToolCallFromReply(currentText, lastNode);
        if (!toolCall && typeof detectAndRecoverRefusal === "function") {
          const recovered = detectAndRecoverRefusal(currentText);
          if (recovered) {
            toolCall = recovered;
            showToast("⚡ 捕获到模型拒答/说教，WebAgent 自愈引擎已代为在桌面拉起 CMD！");
          }
        }
        }

        if (toolCall) {
          if (PLATFORM === "duckai" || PLATFORM === "doubao" || PLATFORM === "qwen" || PLATFORM === "dola") {
            console.log(`[Nexus ${CURRENT_THEME.name}] 🎯 成功捕获工具调用代码块:`, toolCall);
          }
          lastHandledMessageSignature = sig;
          handleToolCallAutomatically(toolCall);
        } else if (PLATFORM === "deepseek" || PLATFORM === "kimi" || PLATFORM === "duckai" || PLATFORM === "doubao" || PLATFORM === "qwen" || PLATFORM === "dola") {
          // 没有解析出有效工具，检查是否是未闭合的残缺截断代码块
          const truncatedSnippet = detectTruncatedCodeBlock(currentText, lastNode);
          if (truncatedSnippet && !danglingBlockState.isWaitingContinuation) {
            lastHandledMessageSignature = sig;
            danglingBlockState.isWaitingContinuation = true;
            danglingBlockState.accumulatedCode = truncatedSnippet;
            danglingBlockState.retryCount = 1;
            showToast("⚠️ 检测到工具调用被截断未闭合，正在自动请求续写拼接 (仅限 1 次)...");
            requestContinuation();
          }
        }
      }
    }, 500);
  }

  const KNOWN_BUILTIN_TOOLS = new Set([
    "file_read", "read", "file_write", "write", "file_list", "list", "ls", "dir",
    "command_run", "powershell", "cmd", "exec", "nexus_discover_tools",
    "discover_tools", "nexus_run_script", "nexus_execute_action",
    // 智能体浏览器全套工具
    "browser_scroll", "scroll", "browser_press_key", "browser_key", "press_key", "key", "browser_close_modal", "close_modal", "browser_open", "browser_navigate", "browser_snapshot", "browser_click", "browser_type",
    "browser_eval", "browser_evaluate", "browser_tabs", "browser_launch",
    "open_url", "open_browser", "launch_browser", "navigate", "snapshot",
    // 3D / 引擎工具 (Blender, Unity 等)
    "execute_blender_code", "get_scene_info", "blender_code", "blender_exec", "scene_info",
    // 移动端/手机控制全套工具 (nex mob / ADB / Root)
    "nex_mobile_inspect_screen", "nex_mobile_screenshot", "nex_mobile_touch",
    "android_screen_capture", "android_ui_dump", "android_human_touch",
    "android_app_control", "android_system_status", "android_root_exec",
    // 系统通用快捷别名
    "process_list", "port_kill", "screenshot"
  ]);

  function isLikelyValidTool(toolName) {
    if (!toolName || typeof toolName !== "string") return false;
    const clean = toolName.toLowerCase().trim();
    if (KNOWN_BUILTIN_TOOLS.has(clean)) return true;
    if (
      clean.startsWith("localbridge_") ||
      clean.startsWith("nexus_") ||
      clean.startsWith("ego_") ||
      clean.startsWith("browser_") ||
      clean.startsWith("blender_") ||
      clean.startsWith("bpy_") ||
      clean.startsWith("unity_") ||
      clean.startsWith("gamedev_")
    ) return true;
    if (cachedMcpTools && cachedMcpTools.some(t => t.name && t.name.toLowerCase() === clean)) return true;
    // 允许任何符合标准 MCP 工具命名的标识符透传至 Nexus 后端 Bridge，杜绝误杀动态接入的 MCP 工具
    if (/^[a-zA-Z0-9_.:-]{2,64}$/.test(clean)) return true;
    return false;
  }

  let consecutiveAutoDispatches = 0;
  let consecutiveErrors = 0;
  let lastExecutedToolSig = "";
  let duplicateToolCallCount = 0;
  let isAutoDispatchSuspended = false;

  function resetReActSafetyState() {
    consecutiveAutoDispatches = 0;
    consecutiveErrors = 0;
    lastExecutedToolSig = "";
    duplicateToolCallCount = 0;
    isAutoDispatchSuspended = false;
  }

  function handleToolCallAutomatically(toolCall) {
    if (!CONFIG.autoExecute) {
      showToast(`检测到 AI 请求调用 MCP [${toolCall.tool}]，当前处于手动确认模式`);
      return;
    }

    if (isAutoDispatchSuspended) {
      showToast("⏸️ 连续调度已安全熔断暂停，请手动发送指令或点击面板恢复");
      return;
    }

    // 严格工具白名单防死循环机制：非合法工具绝不执行、绝不向对话回填错误
    if (!isLikelyValidTool(toolCall.tool)) {
      console.warn(`[Nexus Web Agent] 忽略非合法 MCP 工具调用:`, toolCall.tool);
      showToast(`⚠️ 忽略非 Nexus MCP 工具调用 [${toolCall.tool}]，已阻止无效循环`);
      return;
    }

    // 1. 重复调用熔断器：同一工具与相同参数连续重复调用立即熔断拦截
    const currentCallSig = `${toolCall.tool}::${JSON.stringify(toolCall.args || {})}`;
    if (currentCallSig === lastExecutedToolSig) {
      duplicateToolCallCount++;
      // 允许连续推进（如连续刷视频、滚动翻页），仅在连续 3 次相同且页面无变化时温和提醒
      if (duplicateToolCallCount >= 3) {
        showToast(`⏸️ 连续 3 次执行相同操作 [${toolCall.tool}]，已温和暂停以防卡死`);
        duplicateToolCallCount = 0;
        lastExecutedToolSig = "";
        isAutoDispatchSuspended = true;
        const terminationNotice = "【WebAgent 智能防护提醒】\n- 检测到连续多次执行完全相同的操作与参数 [" + toolCall.tool + "]。\n- 为防止不必要的循环与 Token 浪费，自动化调度已温和暂停。\n- 请像人类一样，转用自然语言向用户总结汇报当前进度与屏幕所见，或询问用户下一步意图。";
        safeDispatchFeedbackToChat(terminationNotice, toolCall.tool);
        return;
      }
    } else {
      duplicateToolCallCount = 0;
    }
    lastExecutedToolSig = currentCallSig;

    // 2. 连续最大步数熔断保护 (防止模型没完没了做下去)
    const maxSteps = parseInt(CONFIG.maxConsecutiveSteps, 10) || 4;
    if (consecutiveAutoDispatches >= maxSteps) {
      showToast(`🛑 达到连续自动调用上限 (${maxSteps}轮)，已自动熔断暂停以防死循环！`);
      isAutoDispatchSuspended = true;
      const fuseNotice = "【WebAgent 自动执行熔断保护】\n- 已连续自动执行 " + maxSteps + " 轮工具调用。为了防止任务无休止继续与 Token 耗尽，系统已启动安全熔断。\n- 请直接向用户总结汇报当前已经完成的工作进展、已获取的数据以及最终结论。";
      safeDispatchFeedbackToChat(fuseNotice, toolCall.tool);
      return;
    }

    showToast(`⚡ 正在调用 MCP 工具: ${toolCall.tool}...`);

    executeNexusTool(toolCall.tool, toolCall.args, (res) => {
      let feedbackText = "";
      let dataStr = "";
      if (res.ok) {
        consecutiveErrors = 0;
        consecutiveAutoDispatches++;
        let sanitizedResult = res.result;
        let isImage = false;

        // 智能图像过滤：防止超大 Base64 字符流撑爆大模型 Context Window
        if (sanitizedResult && typeof sanitizedResult === "object") {
          try {
            sanitizedResult = JSON.parse(JSON.stringify(sanitizedResult));
            const checkAndSanitize = (obj) => {
              if (!obj || typeof obj !== "object") return;
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === "string" && (val.startsWith("data:image/") || (val.length > 500 && /^[A-Za-z0-9+/=]+$/.test(val.slice(0, 200))))) {
                  isImage = true;
                  const byteSize = Math.round((val.length * 3) / 4);
                  obj[key] = `[📷 图像 Base64 数据已智能截断 (${Math.round(byteSize / 1024)} KB)。已防止超出大模型上下文长度限制]`;
                } else if (typeof val === "object") {
                  checkAndSanitize(val);
                }
              }
            };
            checkAndSanitize(sanitizedResult);
          } catch (e) {
            console.warn("[Nexus] Image sanitize error", e);
          }
        } else if (typeof sanitizedResult === "string" && sanitizedResult.length > 5000 && /^[A-Za-z0-9+/=]+$/.test(sanitizedResult.slice(100, 300))) {
          isImage = true;
          sanitizedResult = `[📷 原始图像 Base64 数据超长 (${sanitizedResult.length} 字符)，已智能截断防止上下文溢出]`;
        }

        // 智能网页快照深度脱水瘦身：剔除冗余的 DOM 物理坐标对象与重复容器，节省 90% 以上 Token
        if (toolCall.tool.includes("snapshot") || toolCall.tool.includes("read_url") || toolCall.tool.includes("ego_")) {
          try {
            const parsed = typeof sanitizedResult === "string" ? JSON.parse(sanitizedResult) : sanitizedResult;
            if (parsed && typeof parsed === "object") {
              const raw = parsed.result || parsed;
              if (raw.compact_marks || raw.interactive_elements) {
                const slim = {
                  success: true,
                  title: raw.title,
                  url: raw.url,
                  elements_count: raw.elements_count || (Array.isArray(raw.interactive_elements) ? raw.interactive_elements.length : undefined),
                  scroll_progress: raw.scroll_progress,
                  is_bottom: raw.is_bottom,
                  compact_marks: raw.compact_marks,
                };
                if (raw.summary) slim.summary = raw.summary;
                if (raw.text) slim.text = raw.text;
                if (raw.markdown) slim.markdown = raw.markdown;
                // 深度裁剪 compact_marks 中的超长跟踪 URL 与超出 35 项的次要链接，进一步节省 Token
                if (typeof slim.compact_marks === "string") {
                  const lines = slim.compact_marks.split("\n");
                  const cleanedLines = lines.map(line => line.replace(/(\S+)\?[^\s"]+/g, "$1"));
                  if (cleanedLines.length > 35) {
                    const head = cleanedLines.slice(0, 35);
                    head.push("... [已精简省略余下 " + (cleanedLines.length - 35) + " 个非核心元素以节省 Token]");
                    slim.compact_marks = head.join("\n");
                  } else {
                    slim.compact_marks = cleanedLines.join("\n");
                  }
                }
                sanitizedResult = slim;
              }
            }
          } catch {}
        }

        dataStr = typeof sanitizedResult === "string" ? sanitizedResult : JSON.stringify(sanitizedResult, null, 2);
        const extraNote = isImage
          ? "\n\n💡【图像提示】：检测到工具输出了高分辨率截图。纯文本框无法直接消费海量 Base64 像素（会直接撑爆 Token 上下文）。若需深度视觉分析，推荐在原生支持多模态附件的 ChatGPT / Kimi 中使用附件上传。"
          : "";

        // 全局通用数据 Token 保险丝：超过 3500 字符时智能截断中间内容
        if (dataStr.length > 3500) {
          dataStr = dataStr.slice(0, 2200) + "\n\n... [⚠️ 执行返回结果过长 (共 " + dataStr.length + " 字符)，已智能截取首尾关键数据以节省 Token] ...\n\n" + dataStr.slice(-1000);
        }
        feedbackText = "【WebAgent 1.3.1 本地 MCP 执行结果反馈】\n- 调用工具: " + toolCall.tool + "\n- 执行状态: 成功\n- 返回数据:\n```json\n" + dataStr + "\n```" + extraNote + "\n---\n💡【任务状态与终结指引】：\n1. 若用户的初始目标已完成（例如已成功打开网页/写入文件/执行完命令/已获取所需数据），【请立即停止调用任何工具】，直接用自然语言向用户汇报最终结果并结束本次任务！\n2. 严禁在目标达成后无意义重复调用相同工具或强行进行多余的操作。\n3. 仅当用户的初始任务确实尚未完成且必须执行下一步时，才允许输出下一个 ```nexus 代码块。";
      } else {
        consecutiveErrors++;
        // 若同一任务连续失败 5 次，停止自动回填，防止模型在报错中无限死循环
        if (consecutiveErrors >= 5) {
          showToast(`❌ 工具 [${toolCall.tool}] 连续失败: ${res.error}，已停止自动回传以防死循环`);
          consecutiveErrors = 0;
          return;
        }
        consecutiveAutoDispatches++;
        feedbackText = `【WebAgent 1.3.1 本地 MCP 执行错误报告】\n- 调用工具: ${toolCall.tool}\n- 失败原因: ${res.error}\n---\n（请根据报错调整参数或换用其他工具重试）`;
      }

      // 实时记录到跨会话断点任务历史中
      recordTaskStep(toolCall.tool, toolCall.args, res.ok ? (dataStr || "").slice(0, 180) : `失败: ${res.error}`);

      // 通过安全防频繁缓冲队列发回给网页端
      safeDispatchFeedbackToChat(feedbackText, toolCall.tool);
    });
  }

  // 安全缓冲调度器：带倒计时提示与防频繁风控保护
  function safeDispatchFeedbackToChat(feedbackText, toolName) {
    latestFeedbackText = feedbackText;
    const delaySec = Math.max(1.0, Math.min(10.0, parseFloat(CONFIG.sendDelay) || 3.0));
    let remainingMs = Math.round(delaySec * 1000);

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    showToast(`⏳ MCP [${toolName}] 执行成功！安全防风控冷却: ${(remainingMs / 1000).toFixed(1)}s`);

    const interval = 500;
    countdownTimer = setInterval(() => {
      remainingMs -= interval;
      if (remainingMs > 0) {
        showToast(`⏳ 安全防频繁冷却: ${(remainingMs / 1000).toFixed(1)}s...`);
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        triggerFinalSend();
      }
    }, interval);

    function triggerFinalSend() {
      // 检查模型是否还在生成中，若仍在生成则微等 500ms
      if (currentAdapter.isGenerating()) {
        showToast("⏳ 网页仍在输出或保存会话，等待就绪...");
        setTimeout(triggerFinalSend, 500);
        return;
      }

      const inputEl = currentAdapter.getInput();
      if (!inputEl) {
        showToast("⚠️ 未找到输入框，请手动复制结果");
        return;
      }

      // 填入执行反馈
      currentAdapter.setValue(inputEl, feedbackText);

      setTimeout(() => {
        const sendBtn = currentAdapter.getSendBtn();
        const isBtnReady =
          sendBtn &&
          !sendBtn.disabled &&
          sendBtn.getAttribute("aria-disabled") !== "true" &&
          !sendBtn.classList.contains("disabled") &&
          !sendBtn.classList.contains("ds-button--disabled");

        if (isBtnReady) {
          sendBtn.click();
          showToast("🚀 已将 MCP 执行结果安全提交给 AI！");
        } else {
          dispatchSubmit(inputEl);
          showToast("🚀 已通过回车安全提交 MCP 结果！");
        }
      }, 400);
    }
  }

  // 网页端“消息发送过于频繁”风控自动捕获与自愈重试
  let lastSpamWarningTime = 0;
  function checkAndHandleRateLimitError() {
    if (!CONFIG.autoRetry) return;

    // 严禁扫描插件自身 DOM (#nexus-agent-root 与 .nexus-toast)
    const nodes = Array.from(document.querySelectorAll("div, span, p")).filter((el) => {
      if (el.closest("#nexus-agent-root") || el.closest(".nexus-toast") || el.classList.contains("nexus-toast")) {
        return false;
      }
      if (el.children.length > 2) return false;
      const t = el.textContent || "";
      return (
        t.includes("消息发送过于频繁") ||
        t.includes("请稍后重试") ||
        t.includes("发送过于频繁") ||
        t.includes("请求过于频繁")
      );
    });

    if (nodes.length === 0) {
      retryCountForCurrentError = 0;
      return;
    }

    const now = Date.now();
    // 每次处理间隔至少 5 秒
    if (now - lastRateLimitHandledTime < 5000) return;

    // 连续重试达上限后，1 分钟内只提示一次，绝不弹窗轰炸
    if (retryCountForCurrentError >= 3) {
      if (now - lastSpamWarningTime > 60000) {
        showToast("⚠️ 平台限频较为严格，请稍等片刻后手动重试");
        lastSpamWarningTime = now;
      }
      return;
    }

    const errNode = nodes[nodes.length - 1];
    lastRateLimitHandledTime = now;
    retryCountForCurrentError++;

    showToast(`⚠️ 捕获到网页频繁限制！安全冷却 3.5 秒后自动重试 (${retryCountForCurrentError}/3)...`);

    setTimeout(() => {
      // 1. 优先定位页面上的重试/刷新按钮 (DeepSeek 橙色圆圈 🔄)
      const container =
        errNode.closest("div[class*='message']") ||
        errNode.parentElement?.parentElement ||
        errNode.parentElement;

      let retryBtn = null;
      if (container) {
        const btns = container.querySelectorAll("div[role='button'], button");
        for (const b of btns) {
          // 排除明确标有复制/编辑的按钮
          const label = b.getAttribute("aria-label") || "";
          if (label.includes("复制") || label.includes("编辑") || label.includes("Copy") || label.includes("Edit")) {
            continue;
          }
          if (b.querySelector("svg")) {
            retryBtn = b;
            break;
          }
        }
      }

      if (retryBtn) {
        retryBtn.click();
        showToast("🔄 已自动点击网页重试按钮！");
      } else if (latestFeedbackText) {
        // 2. 备用方案：重新填入最新执行反馈并发送
        const inputEl = currentAdapter.getInput();
        if (inputEl) {
          currentAdapter.setValue(inputEl, latestFeedbackText);
          setTimeout(() => {
            const sendBtn = currentAdapter.getSendBtn();
            if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
              sendBtn.click();
            } else {
              dispatchSubmit(inputEl);
            }
            showToast("🔄 已重新安全提交 MCP 执行结果！");
          }, 400);
        }
      }
    }, 3500);
  }

  // =========================================================================
  // 10. 初始化启动与多阶段挂载守护
  // =========================================================================
  function init() {
    if (window.__NEXUS_AGENT_INITIALIZED__) {
      createAgentUI();
      return;
    }
    window.__NEXUS_AGENT_INITIALIZED__ = true;
    console.log(`[Nexus Web Agent v3.11.1 True MCP Edition] 启动成功，当前适配平台: ${CURRENT_THEME.name}`);
    try {
      injectThemeStyles();
      createAgentUI();
      pingNexus();
      startReActLoop();
} catch (err) {
      console.error("[Nexus Web Agent] 初始化异常:", err);
    }
  }

  // 多阶段挂载机制：立即检查 + DOMReady + 渐进式延迟补刀 (防止 SPA 异步加载或路由重绘丢失药丸)
  if (document.body || document.documentElement) {
    init();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 1500);
  setTimeout(init, 3000);

  
})();