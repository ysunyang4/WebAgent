// WebAgent 1.3.1 - Popup Controller
document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);

  chrome.storage.local.get({
    webagent_auto_execute: false,
    webagent_auto_retry_rate_limit: true,
    webagent_review_safe_mode: true,
    webagent_workspace_dir: '',
        webagent_bridge_url: 'http://127.0.0.1:18080'
  }, (items) => {
    $('autoExecuteToggle').checked = items.webagent_auto_execute;
    $('autoRetryToggle').checked = items.webagent_auto_retry_rate_limit;
    $('safeModeToggle').checked = items.webagent_review_safe_mode;
    $('workspacePathInput').value = items.webagent_workspace_dir || '';  });

  $('saveConfigBtn').addEventListener('click', () => {
    const newConfig = {
      webagent_auto_execute: $('autoExecuteToggle').checked,
      webagent_auto_retry_rate_limit: $('autoRetryToggle').checked,
      webagent_review_safe_mode: $('safeModeToggle').checked,
      webagent_workspace_dir: $('workspacePathInput').value.trim()
    };
    chrome.storage.local.set(newConfig, () => {
      const btn = $('saveConfigBtn');
      const oldText = btn.textContent;
      btn.textContent = '✅ 已保存';
      setTimeout(() => { btn.textContent = oldText; }, 1500);
    });
  });

  async function checkServices() {
    let bridgeOk = false;
    let bridgePing = 0;

    const start = Date.now();
    try {
      const res = await fetch('http://127.0.0.1:18080/health', { method: 'GET', signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        bridgeOk = true;
        bridgePing = Date.now() - start;
      }
    } catch(e) {}

    const badge = $('bridgeStatusBadge');
    if (bridgeOk) {
      badge.textContent = '🟢 在线 (' + bridgePing + 'ms)';
      badge.className = 'status-badge online';
    } else {
      badge.textContent = '🔴 离线 (请启动桌面端)';
      badge.className = 'status-badge offline';
    }

    const mcpSpan = $('mcpBridgeStatus');
    mcpSpan.textContent = bridgeOk ? ('🟢 在线 (' + bridgePing + 'ms)') : '🔴 离线';
    mcpSpan.className = 'badge ' + (bridgeOk ? 'green' : 'red');
  }

  checkServices();

  $('injectPromptBtn').addEventListener('click', () => {
    const ws = $('workspacePathInput').value.trim() || '（支持全盘绝对路径，可由 AI 自动推断）';
    const fence = String.fromCharCode(96).repeat(3);
    const text = [
      "请根据我的实际请求使用 Nexus / WebAgent 中已连接的 MCP 工具。",
      "在执行前核实工具可用，无法连接时如实说明，不要编造执行结果。",
      "删除文件、运行敏感命令、修改系统配置等操作应先得到明确授权。",
      "请遵守正常的安全限制并保留必要的审批流程。",
      "当前工作目录：" + ws,
      "仅在工具桥支持时使用单步工具调用格式：",
      fence + "nexus",
      '{"tool":"command_run","command":"dir"}',
      fence,
      "收到真实执行结果后再进行总结。"
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      const btn = $('injectPromptBtn');
      const oldText = btn.textContent;
      btn.textContent = '✅ 已复制到剪贴板';
      setTimeout(() => { btn.textContent = oldText; }, 1500);
    });
  });
});
