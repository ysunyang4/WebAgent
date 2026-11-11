# WebAgent (Web AI MCP Bridge)

WebAgent 是一个专为网页端大模型（DeepSeek、ChatGPT、Kimi、通义千问、豆包、Duck.ai、Dola 等）打造的浏览器扩展，提供原生浮动交互面板与本地 MCP 工具调度桥接。

## 📦 安装使用指南

1. 下载或克隆本项目到本地；
2. 在 Chromium 内核浏览器（Chrome、Edge、Brave 等）中打开扩展程序管理页面：`chrome://extensions/`；
3. 开启右上角「开发者模式」；
4. 点击左上角「加载已解压的扩展程序」，选择本项目文件夹；
5. 打开任意支持的网页大模型对话页面，页面顶部即可看到 WebAgent 浮动控制卡片。

## 🌟 核心特性

- **多模型原生适配**：DeepSeek、ChatGPT、Kimi、通义千问 (Qwen)、豆包 (Doubao)、Duck.ai、Dola 等。
- **本地 MCP 桥接**：支持标准 MCP 工具调用（文件读写、命令行运行、网页快照等）。
- **极简交互设计**：自适应明暗主题、可自由拖拽位置与收起抽屉。
- **隐私保护**：仅与本地 127.0.0.1 端口通信，无任何第三方云端遥测与个人数据收集。
