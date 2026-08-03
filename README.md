# 学栖 StudyNest

开源、**本地优先**的 AI Agent，帮助国际部（IB / AP / A-Level）学生做学习规划、背景提升与时间管理。

- 🔒 **数据 100% 本地**：所有数据存于浏览器 IndexedDB，永不上传服务器；支持 JSON 一键导出/导入备份
- 🪶 **极简三导航**：聊天 / 画板 / 设置。聊天是唯一的操作入口，画板是唯一的数据视图
- 🕸️ **成长画板**：无限画布，事项是节点、关系是边；**反思以「连接两件事的边」呈现**——绑了反思的边加粗带标题，没绑的是发丝虚线，一眼看出你在哪些连接上真正想过
- 📥 **粘贴即导入**：微信群通知/邮件文字直接粘贴，AI 解析成日程与任务，确认后入库
- 🤖 **主动式 Agent**：DDL 临近没安排、任务积压、档案缺失——学栖在对话里主动开口
- ✅ **提案确认制**：AI 不直接写数据，所有安排以卡片提案，你确认才生效
- ✍️ **机器声 / 人声**：系统说的话用等宽，你写下的一切用衬线——AI 参与到哪一步，排版上看得见
- 🔑 **自带 Key 直连**：填入 DeepSeek（或任意 OpenAI 兼容）API Key，浏览器直连模型服务商，Key 只存本机
- 🧩 **Skill Runtime**：直接运行 [Skills 仓库](https://github.com/ChromiteCr/Skills)的 `SKILL.md`——同一份文件在 Claude Code 里也能跑，不是另立格式。skill 是纯文本、无可执行代码，能碰什么由**能力白名单**决定，写库一律要你在卡片上确认

## 快速开始

```bash
npm install
npm run dev
```

打开设置填入 [DeepSeek API Key](https://platform.deepseek.com)，即可开始对话。

内置 skill 由 `src/generated/skills.json` 提供，已提交进仓库，构建不依赖外部仓库。改动 [Skills 仓库](https://github.com/ChromiteCr/Skills)后重新采集：

```bash
npm run skills:sync            # 默认找 ../Skills，也可 --from <path> 或设 $STUDYNEST_SKILLS_REPO
```

## 技术栈

Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Zustand · Dexie.js (IndexedDB) · @xyflow/react（画板）· OpenAI SDK（兼容通道）

## 路线图

| 阶段 | 内容 |
|---|---|
| S1 | 骨架 + 聊天核心（本地持久化、流式对话、自带 Key） |
| S2 | Profile + 任务 + 主动式 Agent + 粘贴即导入 |
| S3 | 活动档案 + 时间轴 + 成果网络图 |
| S4 | Reflection Studio（AI 采访式反思 + 多媒体） |
| S5 | Skill 系统 + 迁移到自有域名 app.nestudy.cn |
| S6 | 数据层统一（事项 / 资产 / 画板三张表） |
| S7 | 极简界面重构（三导航 + 无边记式画板 + 反思即边） |
| S8 | Skill Runtime 内核（SKILL.md 加载器 + 开放 Capability 注册表 + 多轮 session） |
| S9 | 国际申请能力层（申请数据模型 + 参考数据集 + 确定性 tool） |
| S10 | 首批 P0 skills |
| S11 | 后端：登录 + AI 转发 + 用量计数 |
| S12 | Skill 商店 |
| S13 | Plugin 系统（系统 plugin + 时间轴回归） |
| 专项 | 模型安全与质量评测（红队 + eval，公开推广前完成） |

## 版本记录

| 版本 | 日期 | 变更内容 | 类型 |
|------|------|----------|------|
| S8 | 2026-08-03 | Skill Runtime 内核：直接加载 Skills 仓库的 SKILL.md（构建期采集为 src/generated/skills.json，运行时解析，内置与日后商店安装共用一个解析器），招生官读档从内置 JSON 迁为标准 SKILL.md；工具层重做为**开放 Capability 注册表**（9 个旧工具收敛为 get_profile/get_events/get_artifacts/propose_events/propose_profile_update/propose_canvas/propose_artifact，owner 字段给 S13 plugin 留口），propose_canvas 改用稳定 node id 取代标题匹配；agent loop 抽到 lib/runtime/executor.ts，轮数上限按 skill 可配（默认 8）+ 工具输出预算兜底，skill 激活态随会话持久化、刷新不再丢；Dexie v7 新增 skillRuns 取代 settings.usedSkillIds 并删除六张 v5 遗留表，导出升至 v7；删除 S6 兼容层与 planningStore 的派生旧数组 | milestone |
| S7a2 | 2026-08-03 | 聊天页新增可折叠的对话抽屉（新对话按钮 + 对话列表，与画板抽屉同一套结构：宽屏并排、窄屏浮层覆盖），会话切换不再挤在头部下拉里；字号整体上调一档（衬线在相同像素下比无衬线显小，原来照搬 Tailwind 默认在宋体上偏挤）；随之修掉窄屏提醒卡被按钮挤到换行、输入框占位文字被撑出半行两处 | fix |
| S7a1 | 2026-08-02 | UI 柔化：圆角统一放大一档（--radius 0.25→0.5rem，画板控件一并接入），深浅两套配色整体降对比——浅色底不取纯白、正文不取近黑，深色底抬离纯黑、正文压离纯白，画板类别色彩度压低；补上 S7 漏改的两处：助手消息去掉灰底气泡（有容器的只应是学生自己写下的内容）、自选主色改为只作用于画板签名色与焦点态而非全站刷 --primary | fix |
| S7 | 2026-08-02 | 极简界面重构：左侧导航收敛为聊天/画板/设置三项（56px 图标导轨）；成长星图从 3D 球体重做为「无边记」式无限画板，反思以「连接两件事的边」呈现（绑定的边加粗带标题，未绑定的是发丝虚线）；面板/任务/活动/时间轴/反思工作室五个视图删除，主动提醒迁入聊天；设计系统换为衬线正文（Source Serif 4 + 思源宋体）+ 等宽机器声，界面无彩、只有画板数据有颜色 | milestone |
| S6 | 2026-08-02 | 数据层统一：任务/日程/活动合并为 growthEvents（短期+长期），反思并入 artifacts，星图元数据换成 canvasNodes/canvasEdges；Dexie v6 首个 upgrade 函数（含 activity: → event: 节点 id 前缀改写），导出升级到 v6 且导入兼容 v5 旧备份；旧视图经兼容层零改动继续运行 | milestone |
| S5b | 2026-08-02 | 前端迁移到自有域名 app.nestudy.cn：新增 public/CNAME，vite base 由 '/studynest/' 改为 '/' | feat |
| S5a2 | 2026-07-21 | 修复面板点击具体任务/DDL 不跳转到对应内容：任务页 Tabs 原来是无状态、每次挂载都重置成「今日」页；新增 taskUiStore 预置目标 tab + 定位 id，面板点击任务行/DDL 行会跳转任务页、切到正确 tab 并滚动高亮 | fix |
| S5a1 | 2026-07-21 | 修复 GitHub Pages 部署空白页：仓库 Pages Source 一直是"Deploy from a branch"（旧式），导致线上服务未构建的原始 index.html；在 deploy.yml 标注该前置条件，指导切到"GitHub Actions"后部署恢复正常 | fix |
| S5a | 2026-07-21 | Skill 系统骨架：声明式 JSON skill 定义 + 引擎（system prompt 注入人设 + 收窄工具面），落地首个官方 skill「招生官读档」；聊天页手动选择入口 + 规则引擎 R6（活动数达标且从未用过时主动建议）双触发打通全流程 | feat |
| S4d2 | 2026-07-20 | 修复星图节点卡片按钮点击无响应：卡片容器只挡了 pointerDown 冒泡，pointerUp 仍会冒泡到画布触发命中测试并把卡片关掉，抢在按钮 onClick 之前关闭；编辑改为弹出对话框（更大，长文字不挤爆小卡片） | fix |
| S4d1 | 2026-07-20 | 修复反思卫星节点导致的 React Hooks 顺序崩溃（星图所有编辑操作因此失效）；反思不再计入"全部事项"的"尚未连接"分组，改为独立"反思"分组；反思卡片新增手动编辑/删除；星图/全部事项/时间轴的悬浮长方形卡片统一渐显渐隐动画 | fix |
| S4 | 2026-07-20 | S4 阶段完成：Reflection Studio（AI 采访式反思）+ OPFS 单图附件 + 星图卫星接入 + 主动催写反思 | milestone |
| S4d | 2026-07-20 | 主动 Agent 催写反思规则 + Dashboard 提醒卡跳转分流 + 反思/成果网络占位卡替换为真实入口 + 活动页「反思一下」入口 | feat |
| S4c | 2026-07-20 | 成长星图接入反思节点：绕父活动的卫星坐标，点击弹出精简卡片跳转 Reflection Studio | feat |
| S4b | 2026-07-20 | Reflection Studio：AI 采访式反思（固定模板+追问/自写草稿两种入口）+ 单图附件 + 确认卡入库，侧栏「反思」解禁 | feat |
| S4a | 2026-07-20 | 反思数据地基：Dexie v5 反思表 + CRUD + 导出导入、OPFS 本地附件存储 + 预留上传接口 | feat |
| S3g | 2026-07-19 | 成果网络新增右下角悬浮「全部事项」列表：专业方向/已连接/尚未连接分组，点击直达节点卡片，绕开 3D 遮挡 | feat |
| S3f | 2026-07-19 | 修复时间轴详情卡未锚定在项目右上角的定位 bug（连带修复刻度线与内容 60px 对齐偏差）；长期任务新增到期引导线 | fix |
| S3e | 2026-07-19 | 成果网络改倾斜轨道系：同心轨道环 + 节点在环上，去自转减少眩晕；活动归属线连专业方向；叙事线粗细由强度决定 | feat |
| S3d | 2026-07-19 | 时间轴细化：放大显示更细日期刻度 + 网格线，项目点调大，点击弹详情卡（锚点为项目左上角） | feat |
| S3c | 2026-07-19 | 星图交互：点击星点/边变形卡片，手动编辑 + AI 重新生成，分层快捷设置 + AI 整理，专业方向增删改 | feat |
| S3b | 2026-07-19 | 成果网络重做为可旋转 3D 球体星图（自研 SVG 投影，深度大小/亮度，弧线边，空闲自转） | feat |
| S3a | 2026-07-19 | 时间轴改横向泳道（活动/考试/截止/任务）+ ⌘/Ctrl 滚轮缩放 | feat |
| S3 | 2026-07-19 | S3 阶段完成：活动档案 + 时间轴 + 成果网络图 | milestone |
| S2d | 2026-07-19 | 成果网络图（React Flow）：活动/课程/目标校为节点，AI 提案叙事线连接，手动增删边 | feat |
| S2c | 2026-07-19 | 项目时间轴（学期鸟瞰）：横向聚合活动跨度、考试/DDL/任务，今日线 + 自动定位当下 | feat |
| S2b | 2026-07-19 | 活动档案：Activity 实体 + 手动 CRUD + AI 对话式建档（propose_activities 提案卡） | feat |
| S2a8 | 2026-07-19 | 启动时申请持久化存储资格（navigator.storage.persist），降低浏览器自动清除本地数据的风险 | fix |
| S2a7 | 2026-07-19 | 修复「对话建档」在开发模式下重复发送两条建档消息（StrictMode 副作用双跑） | fix |
| S2a6 | 2026-07-19 | 新增「学栖思考中」指示：栖巢小鸟起伏动画 + 节奏点，覆盖流式等待与工具轮次间隙 | fix |
| S2a5 | 2026-07-19 | 修复设置窗口顶部关闭按钮与分隔线/标题重叠 | fix |
| S2a4 | 2026-07-19 | 外观设置：RGB 拖动条自定义界面主色，实时生效并本机持久化 | fix |
| S2a3 | 2026-07-19 | 移动端适配：竖屏（高>宽）时面板卡片单列纵向展示 | fix |
| S2a2 | 2026-07-19 | 档案并入设置中心编辑；新增名字字段，面板问候语与档案卡个人化 | fix |
| S2a1 | 2026-07-19 | 设置窗口重构：放大为侧栏分类布局（模型/档案/外观/数据），窄屏分类横排 | fix |
| S2 | 2026-07-19 | S2 阶段完成：Profile + 任务 + 主动式 Agent + 粘贴即导入 | milestone |
| S1e | 2026-07-19 | 主动式 Agent v1：规则引擎（DDL无任务/任务积压/回归/档案不完整）+ Dashboard 提醒卡 | feat |
| S1d | 2026-07-19 | 档案建立：空态建档 CTA、对话式采访建档、手动编辑表单、档案摘要卡 | feat |
| S1c | 2026-07-19 | 工具调用管道（agent loop + 提案确认卡模式）+ 粘贴即导入 | feat |
| S1b | 2026-07-19 | 数据模型 v2（档案/事件/任务分表）、任务视图（今日/全部/DDL）、Dashboard 卡片真实化 | feat |
| S1a | 2026-07-18 | 更名学栖 StudyNest；新增面板（Dashboard）主界面，聊天改为侧栏导航视图 | feat |
| S1 | 2026-07-18 | 骨架 + 聊天核心：Vite/React/TS/Tailwind/shadcn 脚手架、Dexie 本地存储 + JSON 导出导入、模型路由（DeepSeek 自带 Key 流式直连）、聊天 UI、GitHub Pages 部署 | milestone |
