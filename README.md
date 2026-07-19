# Student Agent

开源、聊天优先、**本地优先**的 AI Agent，帮助国际部（IB / AP / A-Level）学生做学习规划、背景提升与时间管理。

- 🔒 **数据 100% 本地**：所有数据存于浏览器 IndexedDB，永不上传服务器；支持 JSON 一键导出/导入备份
- 💬 **聊天为主界面**：与 Agent 对话完成一切操作，任务/时间轴/成果网络/反思等视图逐步推出
- 🔑 **自带 Key 直连**：填入 DeepSeek（或任意 OpenAI 兼容）API Key，浏览器直连模型服务商，Key 只存本机
- 🧩 **Skill 体系**（规划中）：声明式 skill + 开源 skill 市场

## 快速开始

```bash
npm install
npm run dev
```

打开设置填入 [DeepSeek API Key](https://platform.deepseek.com)，即可开始对话。

## 技术栈

Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Zustand · Dexie.js (IndexedDB) · OpenAI SDK（兼容通道）

## 路线图

| 阶段 | 内容 |
|---|---|
| S1 | 骨架 + 聊天核心（本地持久化、流式对话、自带 Key） |
| S2 | Profile + 任务 + 主动式 Agent + 粘贴即导入 |
| S3 | 时间轴 + 成果网络图 |
| S4 | Reflection Studio（AI 采访式反思 + 多媒体） |
| S5 | Skill 系统 |
| S6 | Skill 市场 |
| S7 | 文书素材库 + 本地记忆层 + 导出增强 |

## 版本记录

| 版本 | 日期 | 变更内容 | 类型 |
|------|------|----------|------|
| S1 | 2026-07-18 | 骨架 + 聊天核心：Vite/React/TS/Tailwind/shadcn 脚手架、Dexie 本地存储 + JSON 导出导入、模型路由（DeepSeek 自带 Key 流式直连）、聊天 UI、GitHub Pages 部署 | milestone |
