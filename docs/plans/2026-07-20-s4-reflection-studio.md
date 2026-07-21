# S4 Reflection Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship S4 — an AI 采访式反思模块（Reflection Studio）：固定模板+追问的采访引擎、单图 OPFS 附件、反思作为星图卫星节点接入，外加主动 Agent 催写反思的规则。

**Architecture:** 复用 S2/S3 已建立的模式——数据经 planningStore 统一管理、AI 一次性 completion（非工具调用循环，参照 `graph-ai.ts`）生成内容、跨视图预填用 store 承载的 pending 信号（参照 chatStore 的 `pendingPrompt`）。反思节点作为星图 `sphere-model.ts` 投影管线里的新 kind，以"卫星绕父活动"的方式追加坐标，不改动既有轨道分层逻辑。

**Tech Stack:** Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui (Radix) · Zustand · Dexie.js (IndexedDB) · OpenAI SDK（DeepSeek 兼容通道）· OPFS (`navigator.storage.getDirectory`)

## Global Constraints

- 本项目没有自动化测试框架（无 jest/vitest/pytest），S1-S3 全程用 `npm run build`（`tsc -b && vite build`）做编译正确性把关，UI 改动一律用浏览器手动验证。**本计划的每个任务用 `npm run build` 替代"跑测试"这一步，UI 相关任务额外给出手动验证清单**，不要引入新的测试框架。
- `tsconfig.app.json` 开了 `verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters` —— 类型导入一律用 `import type`，不用的参数前缀 `_`，写完代码要过一遍未用导入。
- 路径别名 `@/*` → `src/*`。
- 中文 UI 文案，风格与现有组件一致（如 `ActivitiesView.tsx` / `ProposalCard.tsx`）。
- 每个"阶段收尾"任务（Task 2 / 8 / 10 / 11）按 `/Users/billgao/.claude/CLAUDE.md` 的版本规则更新 `README.md` 版本记录表（S4a/S4b/S4c/S4d，各自一行，最新的插在表格最上方），其余任务正常 `feat:`/`chore:` 提交，不动版本表。
- **只在 commit 前跑 `npm run build`**，不要引入 `git push`（用户自己 push）。

---

### Task 1: 数据模型 — 类型 + Dexie v5 + CRUD + 导出/导入

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/db/planning.ts`
- Modify: `src/lib/db/backup.ts`
- Modify: `src/stores/planningStore.ts`

**Interfaces:**
- Produces: `Reflection`, `ReflectionQA`, `ReflectionAttachment`, `ReflectionAttachmentKind`, `ReflectionTrigger`, `ReflectionProposedEdge`（`src/types/index.ts`）；`listReflections/addReflection/deleteReflection`（`src/lib/db/planning.ts`）；`usePlanningStore` 新增 `reflections: Reflection[]`、`createReflection(input): Promise<Reflection>`、`removeReflection(id): Promise<void>`
- Consumes: 无（本任务是地基）

- [ ] **Step 1: `src/types/index.ts` — 新增反思相关类型**

在文件顶部 `AppView` 定义处，把：

```ts
export type AppView = 'dashboard' | 'chat' | 'tasks' | 'activities' | 'timeline' | 'graph'
```

改为：

```ts
export type AppView = 'dashboard' | 'chat' | 'tasks' | 'activities' | 'timeline' | 'graph' | 'reflection'
```

在文件的「叙事线」小节之后（`GraphNodeMeta` 接口结束、`// ---- 任务 ----` 分隔注释之前）插入新小节：

```ts
// ---- 反思（S4：AI 采访式反思 + 星图卫星节点） ----

export type ReflectionTrigger = 'activity' | 'freeform' | 'agent'
export type ReflectionAttachmentKind = 'image'

export interface ReflectionQA {
  question: string
  answer: string
}

export interface ReflectionAttachment {
  id: string
  kind: ReflectionAttachmentKind
  /** OPFS 文件引用 */
  ref: string
}

export interface Reflection {
  id: string
  title: string
  trigger: ReflectionTrigger
  /** freeform/agent 触发时可为空 */
  activityId?: string
  qa: ReflectionQA[]
  summary: string
  /** S4 UI 限 1 张图片；结构不限，S5 放开 */
  attachments: ReflectionAttachment[]
  source: DataSource
  createdAt: number
}

/** 反思草稿里 AI 建议的叙事线：source 固定为这条反思本身，只需给出 target */
export interface ReflectionProposedEdge {
  include: boolean
  targetLabel: string
  reason: string
  strength: number
  targetNodeId: string | null
}
```

找到 `ExportBundle` 接口里的这一行：

```ts
  /** v4 起包含 */
  graphNodeMeta?: GraphNodeMeta[]
```

改为：

```ts
  /** v4 起包含 */
  graphNodeMeta?: GraphNodeMeta[]
  /** v5 起包含 */
  reflections?: Reflection[]
```

- [ ] **Step 2: `src/lib/db/index.ts` — Dexie v5**

把顶部 import 里的：

```ts
import type {
  Activity,
  Conversation,
  EventItem,
  GraphNodeMeta,
  Message,
  NarrativeEdge,
  Settings,
  StudentProfile,
  Task,
} from '@/types'
```

改为：

```ts
import type {
  Activity,
  Conversation,
  EventItem,
  GraphNodeMeta,
  Message,
  NarrativeEdge,
  Reflection,
  Settings,
  StudentProfile,
  Task,
} from '@/types'
```

把 `db` 的类型断言里加一行（跟在 `graphNodeMeta` 那行后面）：

```ts
  graphNodeMeta: EntityTable<GraphNodeMeta, 'nodeId'>
  reflections: EntityTable<Reflection, 'id'>
```

在文件末尾（`db.version(4).stores({...})` 之后）追加：

```ts

db.version(5).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  events: 'id, date, type',
  tasks: 'id, dueDate, status, parentEventId',
  activities: 'id, category, startDate',
  narrativeEdges: 'id, sourceNodeId, targetNodeId',
  graphNodeMeta: 'nodeId',
  reflections: 'id, activityId, createdAt',
})
```

- [ ] **Step 3: `src/lib/db/planning.ts` — 反思 CRUD + 活动删除时解除挂靠**

把顶部类型导入：

```ts
import type { Activity, EventItem, GraphNodeMeta, NarrativeEdge, StudentProfile, Task } from '@/types'
```

改为：

```ts
import type { Activity, EventItem, GraphNodeMeta, NarrativeEdge, Reflection, StudentProfile, Task } from '@/types'
```

找到 `deleteActivity`：

```ts
export async function deleteActivity(id: string): Promise<void> {
  await db.transaction('rw', db.activities, db.narrativeEdges, async () => {
    const nodeId = `activity:${id}`
    await db.narrativeEdges.where('sourceNodeId').equals(nodeId).delete()
    await db.narrativeEdges.where('targetNodeId').equals(nodeId).delete()
    await db.activities.delete(id)
  })
}
```

改为（新增：删活动时反思保留内容，只解除挂靠，不级联删除）：

```ts
export async function deleteActivity(id: string): Promise<void> {
  await db.transaction('rw', db.activities, db.narrativeEdges, db.reflections, async () => {
    const nodeId = `activity:${id}`
    await db.narrativeEdges.where('sourceNodeId').equals(nodeId).delete()
    await db.narrativeEdges.where('targetNodeId').equals(nodeId).delete()
    await db.reflections.where('activityId').equals(id).modify({ activityId: undefined })
    await db.activities.delete(id)
  })
}
```

在「星图节点元数据」小节之后、「日期工具」小节之前插入新小节：

```ts
// ---- 反思 ----

export async function listReflections(): Promise<Reflection[]> {
  return db.reflections.orderBy('createdAt').reverse().toArray()
}

export async function addReflection(input: Omit<Reflection, 'id' | 'createdAt'>): Promise<Reflection> {
  const reflection: Reflection = { ...input, id: newId(), createdAt: Date.now() }
  await db.reflections.add(reflection)
  return reflection
}

export async function deleteReflection(id: string): Promise<void> {
  await db.reflections.delete(id)
}
```

- [ ] **Step 4: `src/lib/db/backup.ts` — 导出/导入 v5**

把：

```ts
const EXPORT_VERSION = 4
```

改为：

```ts
const EXPORT_VERSION = 5
```

把 `exportAll` 里的：

```ts
  const [conversations, messages, settings, profile, events, tasks, activities, narrativeEdges, graphNodeMeta] =
    await Promise.all([
      db.conversations.toArray(),
      db.messages.toArray(),
      getSettings(),
      getProfile(),
      db.events.toArray(),
      db.tasks.toArray(),
      db.activities.toArray(),
      db.narrativeEdges.toArray(),
      db.graphNodeMeta.toArray(),
    ])
```

改为：

```ts
  const [conversations, messages, settings, profile, events, tasks, activities, narrativeEdges, graphNodeMeta, reflections] =
    await Promise.all([
      db.conversations.toArray(),
      db.messages.toArray(),
      getSettings(),
      getProfile(),
      db.events.toArray(),
      db.tasks.toArray(),
      db.activities.toArray(),
      db.narrativeEdges.toArray(),
      db.graphNodeMeta.toArray(),
      db.reflections.toArray(),
    ])
```

把返回对象里的：

```ts
    activities,
    narrativeEdges,
    graphNodeMeta,
    settings: { ...settings, modelConfig: safeModelConfig },
```

改为：

```ts
    activities,
    narrativeEdges,
    graphNodeMeta,
    reflections,
    settings: { ...settings, modelConfig: safeModelConfig },
```

把 `importAll` 里的事务表清单：

```ts
  await db.transaction(
    'rw',
    [db.conversations, db.messages, db.settings, db.profile, db.events, db.tasks, db.activities, db.narrativeEdges, db.graphNodeMeta],
    async () => {
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.events.clear(),
        db.tasks.clear(),
        db.activities.clear(),
        db.narrativeEdges.clear(),
        db.graphNodeMeta.clear(),
      ])
```

改为：

```ts
  await db.transaction(
    'rw',
    [db.conversations, db.messages, db.settings, db.profile, db.events, db.tasks, db.activities, db.narrativeEdges, db.graphNodeMeta, db.reflections],
    async () => {
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.events.clear(),
        db.tasks.clear(),
        db.activities.clear(),
        db.narrativeEdges.clear(),
        db.graphNodeMeta.clear(),
        db.reflections.clear(),
      ])
```

在 `if (bundle.graphNodeMeta?.length) await db.graphNodeMeta.bulkAdd(bundle.graphNodeMeta)` 后面加一行：

```ts
      if (bundle.reflections?.length) await db.reflections.bulkAdd(bundle.reflections)
```

- [ ] **Step 5: `src/stores/planningStore.ts` — 反思状态 + actions**

把顶部类型导入：

```ts
import type { Activity, EventItem, GraphNodeMeta, NarrativeEdge, StudentProfile, Task } from '@/types'
```

改为：

```ts
import type { Activity, EventItem, GraphNodeMeta, NarrativeEdge, Reflection, StudentProfile, Task } from '@/types'
```

把值导入：

```ts
import {
  addActivity,
  addEvent,
  addNarrativeEdge,
  addTask,
  deleteActivity,
  deleteEvent,
  deleteNarrativeEdge,
  deleteTask,
  getProfile,
  isoToday,
  listActivities,
  listEvents,
  listGraphNodeMeta,
  listNarrativeEdges,
  listTasks,
  saveGraphNodeMeta,
  saveProfile,
  updateActivity,
  updateEvent,
  updateNarrativeEdge,
  updateTask,
} from '@/lib/db/planning'
```

改为（新增 `addReflection`、`deleteReflection`、`listReflections`）：

```ts
import {
  addActivity,
  addEvent,
  addNarrativeEdge,
  addReflection,
  addTask,
  deleteActivity,
  deleteEvent,
  deleteNarrativeEdge,
  deleteReflection,
  deleteTask,
  getProfile,
  isoToday,
  listActivities,
  listEvents,
  listGraphNodeMeta,
  listNarrativeEdges,
  listReflections,
  listTasks,
  saveGraphNodeMeta,
  saveProfile,
  updateActivity,
  updateEvent,
  updateNarrativeEdge,
  updateTask,
} from '@/lib/db/planning'
```

在 `PlanningState` 接口里，`activities: Activity[]` 后面加：

```ts
  reflections: Reflection[]
```

在接口的 `createEdge`/`editEdge`/`removeEdge`/`refreshEdges`/`setNodeMeta` 那组之后加：

```ts

  createReflection: (input: Omit<Reflection, 'id' | 'createdAt'>) => Promise<Reflection>
  removeReflection: (id: string) => Promise<void>
```

在 `create<PlanningState>((set, get) => ({` 的初始状态里，`activities: [],` 后面加：

```ts
  reflections: [],
```

在 `load: async () => {` 里，把：

```ts
  load: async () => {
    const [profile, events, tasks, activities, narrativeEdges, metaList] = await Promise.all([
      getProfile(),
      listEvents(),
      listTasks(),
      listActivities(),
      listNarrativeEdges(),
      listGraphNodeMeta(),
    ])
    const graphMeta = Object.fromEntries(metaList.map((m) => [m.nodeId, m]))
    set({ profile, events, tasks, activities, narrativeEdges, graphMeta, loaded: true })
  },
```

改为：

```ts
  load: async () => {
    const [profile, events, tasks, activities, narrativeEdges, metaList, reflections] = await Promise.all([
      getProfile(),
      listEvents(),
      listTasks(),
      listActivities(),
      listNarrativeEdges(),
      listGraphNodeMeta(),
      listReflections(),
    ])
    const graphMeta = Object.fromEntries(metaList.map((m) => [m.nodeId, m]))
    set({ profile, events, tasks, activities, narrativeEdges, graphMeta, reflections, loaded: true })
  },
```

把 `removeActivity`：

```ts
  removeActivity: async (id) => {
    await deleteActivity(id)
    const [activities, narrativeEdges] = await Promise.all([listActivities(), listNarrativeEdges()])
    set({ activities, narrativeEdges })
  },
```

改为（活动删除会解除反思挂靠，需要一并刷新）：

```ts
  removeActivity: async (id) => {
    await deleteActivity(id)
    const [activities, narrativeEdges, reflections] = await Promise.all([
      listActivities(),
      listNarrativeEdges(),
      listReflections(),
    ])
    set({ activities, narrativeEdges, reflections })
  },
```

在 `setNodeMeta` action 实现结束的 `},` 之后（`}))` 之前）加：

```ts

  createReflection: async (input) => {
    const reflection = await addReflection(input)
    set({ reflections: await listReflections() })
    return reflection
  },

  removeReflection: async (id) => {
    await deleteReflection(id)
    set({ reflections: await listReflections() })
  },
```

- [ ] **Step 6: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过，无 TS 错误（新增字段/函数均已在各处补全类型）。

- [ ] **Step 7: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/types/index.ts src/lib/db/index.ts src/lib/db/planning.ts src/lib/db/backup.ts src/stores/planningStore.ts
git commit -m "$(cat <<'EOF'
feat(S4a): 反思数据模型——Dexie v5 + CRUD + 导出导入 + planningStore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: OPFS 存储层 + 预留上传接口（S4a 收尾）

**Files:**
- Create: `src/lib/storage/opfs.ts`
- Create: `src/lib/attachments/upload-targets.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: `opfsSupported(): boolean`、`saveAttachment(file: File): Promise<string>`、`getAttachmentURL(ref: string): Promise<string>`、`deleteAttachment(ref: string): Promise<void>`（`src/lib/storage/opfs.ts`）；`uploadToAiServer(ref: string): Promise<never>`、`uploadToOwnServer(ref: string): Promise<never>`（`src/lib/attachments/upload-targets.ts`）

- [ ] **Step 1: 创建 `src/lib/storage/opfs.ts`**

```ts
/** 反思附件的本地文件存储：Origin Private File System，纯本地读写，不联网。*/

const DIR_NAME = 'reflection-attachments'

export function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

async function attachmentsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DIR_NAME, { create: true })
}

/** 写入一个附件文件，返回用于之后读取/删除的引用（文件名） */
export async function saveAttachment(file: File): Promise<string> {
  const dir = await attachmentsDir()
  const ref = `${crypto.randomUUID()}-${file.name}`
  const handle = await dir.getFileHandle(ref, { create: true })
  const writable = await handle.createWritable()
  await writable.write(file)
  await writable.close()
  return ref
}

/** 读出附件生成可显示的本地 object URL（调用方用完需自行 URL.revokeObjectURL） */
export async function getAttachmentURL(ref: string): Promise<string> {
  const dir = await attachmentsDir()
  const handle = await dir.getFileHandle(ref)
  const file = await handle.getFile()
  return URL.createObjectURL(file)
}

export async function deleteAttachment(ref: string): Promise<void> {
  const dir = await attachmentsDir()
  await dir.removeEntry(ref).catch(() => {})
}
```

- [ ] **Step 2: 创建 `src/lib/attachments/upload-targets.ts`**

```ts
/**
 * 预留接口：多媒体上传通道。S4 只做本地 OPFS 存储，不联网；
 * 这两个函数只定形状，函数体留空实现，S5/S7 真正需要时再填。
 */

export async function uploadToAiServer(_ref: string): Promise<never> {
  throw new Error('尚未实现：AI 服务器上传通道预留至视觉能力上线后')
}

export async function uploadToOwnServer(_ref: string): Promise<never> {
  throw new Error('尚未实现：自建服务器上传通道预留至 ICP 备案完成后')
}
```

- [ ] **Step 3: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。若 `FileSystemDirectoryHandle` / `navigator.storage.getDirectory` 报类型缺失，说明当前 TypeScript 版本的 `dom.d.ts` 未包含 OPFS 类型——检查 `package.json` 里 `typescript` 版本（应为 `~6.0.2`，已内置这些类型），若仍报错则在 `opfs.ts` 顶部加一行 `/// <reference lib="dom" />` 后重试；两者都不行再排查是否需要在 `tsconfig.app.json` 的 `lib` 数组里显式加 `"DOM.AsyncIterable"`。

- [ ] **Step 4: 更新 README 版本记录（S4a 收尾）**

Read `README.md`，在版本记录表格最上方（`| 版本 | 日期 | 变更内容 | 类型 |` 表头下第一行）插入：

```
| S4a | 2026-07-20 | 反思数据地基：Dexie v5 反思表 + CRUD + 导出导入、OPFS 本地附件存储 + 预留上传接口 | feat |
```

- [ ] **Step 5: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/lib/storage/opfs.ts src/lib/attachments/upload-targets.ts README.md
git commit -m "$(cat <<'EOF'
feat(S4a): OPFS 本地附件存储 + 预留上传接口 stub

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 采访引擎（reflection-ai.ts）

**Files:**
- Modify: `src/lib/ai/graph-ai.ts`
- Create: `src/lib/ai/reflection-ai.ts`

**Interfaces:**
- Consumes: `useSettingsStore`（已存在）
- Produces: `getOpenAIClient(): { openai: OpenAI; model: string }`（从 `graph-ai.ts` 导出）；`REFLECTION_TEMPLATE: string[]`、`pickFollowUp(qaSoFar, currentQuestion, currentAnswer): Promise<string | null>`、`coverageFromDraft(draft: string): Promise<number[]>`、`generateReflectionSummary(input): Promise<ReflectionSummaryResult>`（`reflection-ai.ts`）

- [ ] **Step 1: `src/lib/ai/graph-ai.ts` — 把私有 `client()` 导出为 `getOpenAIClient()`**

把：

```ts
function client(): { openai: OpenAI; model: string } {
  const { modelConfig } = useSettingsStore.getState()
  if (!modelConfig.apiKey) throw new Error('请先在设置中填写 API Key')
  return {
    openai: new OpenAI({ baseURL: modelConfig.baseURL, apiKey: modelConfig.apiKey, dangerouslyAllowBrowser: true }),
    model: modelConfig.model,
  }
}

async function oneLine(system: string, user: string): Promise<string> {
  const { openai, model } = client()
```

改为：

```ts
export function getOpenAIClient(): { openai: OpenAI; model: string } {
  const { modelConfig } = useSettingsStore.getState()
  if (!modelConfig.apiKey) throw new Error('请先在设置中填写 API Key')
  return {
    openai: new OpenAI({ baseURL: modelConfig.baseURL, apiKey: modelConfig.apiKey, dangerouslyAllowBrowser: true }),
    model: modelConfig.model,
  }
}

async function oneLine(system: string, user: string): Promise<string> {
  const { openai, model } = getOpenAIClient()
```

再找到 `suggestShells` 函数里的：

```ts
export async function suggestShells(
  items: { label: string; kind: string }[],
  majors: string[],
): Promise<Record<string, number>> {
  const { openai, model } = client()
```

改为：

```ts
export async function suggestShells(
  items: { label: string; kind: string }[],
  majors: string[],
): Promise<Record<string, number>> {
  const { openai, model } = getOpenAIClient()
```

- [ ] **Step 2: 创建 `src/lib/ai/reflection-ai.ts`**

```ts
import { getOpenAIClient } from './graph-ai'
import type { ReflectionQA } from '@/types'

/** STAR 式采访模板：固定 6 题 */
export const REFLECTION_TEMPLATE: string[] = [
  '这段经历里，你具体做了什么？',
  '你在其中扮演的角色或承担的部分是什么？',
  '过程中遇到的最大挑战是什么？',
  '这段经历让你学到了什么、有什么收获？',
  '它和你其他的经历、方向有什么联系吗？',
  '接下来打算怎么继续或延伸这段经历？',
]

function stripQuotes(s: string): string {
  return s.trim().replace(/^["“]|["”]$/g, '')
}

/**
 * 判断某题回答后是否需要追问一个细节；不需要则返回 null。
 * 调用方负责控制每题最多调用几次（避免无限追问）。
 */
export async function pickFollowUp(
  qaSoFar: ReflectionQA[],
  currentQuestion: string,
  currentAnswer: string,
): Promise<string | null> {
  const { openai, model } = getOpenAIClient()
  const history = qaSoFar.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          '你在帮国际部学生做一次反思采访。刚问完一题，判断学生的回答是否值得追问一个更具体的细节（比如说得笼统、缺了具体的例子或数字、或者提到了一个值得展开的点）。如果值得追问，只输出这一个追问问题本身（中文，不超过 30 字，不要编号不要引号）；如果不需要追问，只输出 NONE。不要输出其他任何内容。',
      },
      {
        role: 'user',
        content: `已有问答：\n${history || '（无）'}\n\n刚问的问题：${currentQuestion}\n学生回答：${currentAnswer}`,
      },
    ],
  })
  const text = stripQuotes(res.choices[0]?.message?.content ?? 'NONE')
  return text.toUpperCase() === 'NONE' || !text ? null : text
}

/** 判断自由草稿覆盖了模板中的哪些问题（返回下标数组，0-based），未覆盖的题目之后再逐一补问 */
export async function coverageFromDraft(draft: string): Promise<number[]> {
  const { openai, model } = getOpenAIClient()
  const list = REFLECTION_TEMPLATE.map((q, i) => `${i}. ${q}`).join('\n')
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `下面是反思采访模板的 6 个问题：\n${list}\n\n学生已经自己写了一段草稿。判断草稿实质性覆盖了哪几题（不要求逐字对应，只要内容触及即可），只输出 JSON 数组，形如 [0,2,4]，没有覆盖任何题就输出 []，不要输出其他内容。`,
      },
      { role: 'user', content: draft },
    ],
  })
  const text = res.choices[0]?.message?.content ?? '[]'
  try {
    const jsonStr = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
    const parsed: unknown = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => typeof n === 'number' && n >= 0 && n < REFLECTION_TEMPLATE.length)
  } catch {
    return []
  }
}

export interface ReflectionSummaryResult {
  summary: string
  edges: { targetLabel: string; reason: string; strength: number }[]
}

/** 采访结束后：生成总结 + 可能的叙事线连接建议 */
export async function generateReflectionSummary(input: {
  qa: ReflectionQA[]
  activityTitle?: string
  otherLabels: string[]
}): Promise<ReflectionSummaryResult> {
  const { openai, model } = getOpenAIClient()
  const history = input.qa.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')
  const context = input.activityTitle
    ? `这次反思关联的活动是「${input.activityTitle}」。`
    : '这是一次独立的反思，不关联具体活动。'
  const labelsHint = input.otherLabels.length
    ? `学生已有的其他活动/课程/专业方向节点标题：${input.otherLabels.join('、')}。如果反思内容明确提到了与其中某个的联系，在 edges 里给出建议（target 必须用完全一致的标题）；没有明确联系就给空数组。`
    : ''
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你在帮国际部学生整理一次反思采访的问答记录。${context}根据问答写一段 120-200 字的第一人称反思总结，中文，语气真诚具体，不要空话套话。${labelsHint}只输出 JSON，形如 {"summary":"...","edges":[{"target":"...","reason":"...","strength":3}]}，strength 为 1-5 整数，不要输出其他内容。`,
      },
      { role: 'user', content: history },
    ],
  })
  const text = res.choices[0]?.message?.content ?? '{}'
  const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  const parsed = JSON.parse(jsonStr) as {
    summary?: string
    edges?: { target?: string; reason?: string; strength?: number }[]
  }
  return {
    summary: (parsed.summary ?? '').trim(),
    edges: (parsed.edges ?? [])
      .filter((e) => e.target?.trim())
      .map((e) => ({
        targetLabel: e.target!.trim(),
        reason: e.reason ?? '',
        strength: typeof e.strength === 'number' ? Math.min(5, Math.max(1, Math.round(e.strength))) : 3,
      })),
  }
}
```

- [ ] **Step 3: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/lib/ai/graph-ai.ts src/lib/ai/reflection-ai.ts
git commit -m "$(cat <<'EOF'
feat(S4b): 反思采访引擎——固定模板 + AI 追问 + 总结生成（graph-ai.ts 风格的一次性 completion）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: proposals.ts 扩展——反思草稿的边解析与入库

**Files:**
- Modify: `src/lib/ai/proposals.ts`

**Interfaces:**
- Consumes: `buildSphereNodes`、`resolveLabelToNodeId`（已导入）；`usePlanningStore().createReflection/createEdge`（Task 1 产出）；`ReflectionSummaryResult['edges']` 的元素形状 `{ targetLabel, reason, strength }`（Task 3 产出）
- Produces: `parseReflectionEdges(result: { edges: { targetLabel: string; reason: string; strength: number }[] }): ReflectionProposedEdge[]`、`applyReflectionDraft(input): Promise<Reflection>`

- [ ] **Step 1: 扩展类型导入**

把文件顶部的：

```ts
import type {
  ActivityCategory,
  ActivityLevel,
  Curriculum,
  EventType,
  ProfilePatchProposal,
  ProposedActivity,
  ProposedEdge,
  ProposedEvent,
  ProposedTask,
  TaskPriority,
} from '@/types'
```

改为：

```ts
import type {
  ActivityCategory,
  ActivityLevel,
  Curriculum,
  EventType,
  ProfilePatchProposal,
  ProposedActivity,
  ProposedEdge,
  ProposedEvent,
  ProposedTask,
  Reflection,
  ReflectionAttachment,
  ReflectionProposedEdge,
  ReflectionQA,
  ReflectionTrigger,
  TaskPriority,
} from '@/types'
```

- [ ] **Step 2: 在文件末尾（`applyNarrativeProposal` 之后）追加两个函数**

```ts

/** 解析反思总结生成结果中的建议边为可编辑提案（按当前节点标题解析到 node id） */
export function parseReflectionEdges(result: {
  edges: { targetLabel: string; reason: string; strength: number }[]
}): ReflectionProposedEdge[] {
  const { activities, profile } = usePlanningStore.getState()
  const nodes = buildSphereNodes(activities, profile)
  return result.edges.map((e) => ({
    include: true,
    targetLabel: e.targetLabel,
    reason: e.reason,
    strength: e.strength,
    targetNodeId: resolveLabelToNodeId(e.targetLabel, nodes),
  }))
}

/** 用户确认反思草稿：写入反思条目，再写入勾选的叙事线（source 固定为这条反思本身） */
export async function applyReflectionDraft(input: {
  title: string
  trigger: ReflectionTrigger
  activityId?: string
  qa: ReflectionQA[]
  summary: string
  attachments: ReflectionAttachment[]
  edges: ReflectionProposedEdge[]
}): Promise<Reflection> {
  const store = usePlanningStore.getState()
  const reflection = await store.createReflection({
    title: input.title,
    trigger: input.trigger,
    activityId: input.activityId,
    qa: input.qa,
    summary: input.summary,
    attachments: input.attachments,
    source: 'ai',
  })
  const sourceNodeId = `reflection:${reflection.id}`
  for (const e of input.edges.filter((x) => x.include && x.targetNodeId)) {
    if (e.targetNodeId === sourceNodeId) continue
    await store.createEdge({
      sourceNodeId,
      targetNodeId: e.targetNodeId!,
      label: e.reason,
      strength: e.strength,
      source: 'ai',
    })
  }
  return reflection
}
```

- [ ] **Step 3: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/lib/ai/proposals.ts
git commit -m "$(cat <<'EOF'
feat(S4b): proposals.ts 扩展——反思草稿的边解析（parseReflectionEdges）与确认入库（applyReflectionDraft）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 跨视图信号 store + 附件选择器

**Files:**
- Create: `src/stores/reflectionUiStore.ts`
- Create: `src/components/reflection/AttachmentPicker.tsx`

**Interfaces:**
- Consumes: `opfsSupported`、`saveAttachment`、`getAttachmentURL`、`deleteAttachment`（Task 2 产出）；`ReflectionAttachment` 类型（Task 1 产出）
- Produces: `useReflectionUiStore`（`pendingActivityId`、`pendingOpenId`、`setPendingActivityId`、`setPendingOpenId`）；`<AttachmentPicker attachment={ReflectionAttachment | null} onChange={(a: ReflectionAttachment | null) => void} />`

- [ ] **Step 1: 创建 `src/stores/reflectionUiStore.ts`**

```ts
import { create } from 'zustand'

/** 跨视图的反思入口信号：从活动卡「反思一下」/星图反思卫星/主动提醒卡跳转到 Reflection Studio 时预置上下文 */
interface ReflectionUiState {
  pendingActivityId: string | null
  pendingOpenId: string | null
  setPendingActivityId: (id: string | null) => void
  setPendingOpenId: (id: string | null) => void
}

export const useReflectionUiStore = create<ReflectionUiState>((set) => ({
  pendingActivityId: null,
  pendingOpenId: null,
  setPendingActivityId: (id) => set({ pendingActivityId: id }),
  setPendingOpenId: (id) => set({ pendingOpenId: id }),
}))
```

- [ ] **Step 2: 创建 `src/components/reflection/AttachmentPicker.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { deleteAttachment, getAttachmentURL, opfsSupported, saveAttachment } from '@/lib/storage/opfs'
import type { ReflectionAttachment } from '@/types'

interface AttachmentPickerProps {
  attachment: ReflectionAttachment | null
  onChange: (attachment: ReflectionAttachment | null) => void
}

/** 单张图片附件：本地 OPFS 存储，不做任何上传/分析；浏览器不支持 OPFS 时整个入口隐藏 */
export function AttachmentPicker({ attachment, onChange }: AttachmentPickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null)
      return
    }
    let url: string | null = null
    void getAttachmentURL(attachment.ref).then((u) => {
      url = u
      setPreviewUrl(u)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [attachment])

  if (!opfsSupported()) return null

  const pick = async (file: File) => {
    setBusy(true)
    try {
      if (attachment) await deleteAttachment(attachment.ref)
      const ref = await saveAttachment(file)
      onChange({ id: crypto.randomUUID(), kind: 'image', ref })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (attachment) await deleteAttachment(attachment.ref)
    onChange(null)
  }

  return (
    <div className="flex items-center gap-2">
      {previewUrl ? (
        <div className="relative">
          <img src={previewUrl} alt="反思附图" className="h-16 w-16 rounded-md border object-cover" />
          <button
            type="button"
            aria-label="移除图片"
            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            onClick={() => void remove()}
          >
            <X className="size-2.5" />
          </button>
        </div>
      ) : (
        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted/30">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          <span className="text-[10px]">配图</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pick(file)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/stores/reflectionUiStore.ts src/components/reflection/AttachmentPicker.tsx
git commit -m "$(cat <<'EOF'
feat(S4b): 反思跨视图信号 store + 单图附件选择器（OPFS，不支持时自动隐藏）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 反思确认卡

**Files:**
- Create: `src/components/reflection/ReflectionConfirmCard.tsx`

**Interfaces:**
- Consumes: `ReflectionProposedEdge` 类型（Task 1）；`cn` 工具（`@/lib/utils`，已存在）
- Produces: `<ReflectionConfirmCard summary={string} edges={ReflectionProposedEdge[]} onConfirm={(summary: string, edges: ReflectionProposedEdge[]) => void} onCancel={() => void} />`

- [ ] **Step 1: 创建 `src/components/reflection/ReflectionConfirmCard.tsx`**

```tsx
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ReflectionProposedEdge } from '@/types'

interface ReflectionConfirmCardProps {
  summary: string
  edges: ReflectionProposedEdge[]
  onConfirm: (summary: string, edges: ReflectionProposedEdge[]) => void
  onCancel: () => void
}

/** 采访结束后的确认卡：可编辑总结文字、勾选/取消每条 AI 建议的叙事线连接 */
export function ReflectionConfirmCard({ summary, edges, onConfirm, onCancel }: ReflectionConfirmCardProps) {
  const [draft, setDraft] = useState(summary)
  const [edgeState, setEdgeState] = useState(edges)

  const toggle = (i: number, include: boolean) =>
    setEdgeState((prev) => prev.map((e, idx) => (idx === i ? { ...e, include } : e)))

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <p className="mb-1 text-sm font-medium">反思总结</p>
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-24 text-sm" />
      </div>

      {edgeState.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">AI 建议的连接</p>
          <div className="flex flex-col gap-1.5">
            {edgeState.map((e, i) => {
              const unresolved = !e.targetNodeId
              return (
                <div key={i} className="flex items-start gap-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={e.include && !unresolved}
                    disabled={unresolved}
                    onCheckedChange={(v) => toggle(i, v === true)}
                  />
                  <div className={cn('min-w-0 flex-1', (!e.include || unresolved) && 'opacity-50')}>
                    <p className="text-sm">
                      <span className="font-medium">{e.targetLabel}</span>
                      {unresolved && <span className="ml-1 text-xs text-destructive">（未匹配到节点，无法连接）</span>}
                    </p>
                    {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => onConfirm(draft.trim(), edgeState)}>
          <Check className="size-3.5" />
          确认保存
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onCancel}>
          <X className="size-3.5" />
          取消
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/components/reflection/ReflectionConfirmCard.tsx
git commit -m "$(cat <<'EOF'
feat(S4b): 反思确认卡——总结可编辑 + 建议连接可勾选（复用 ProposalCard 的叙事线卡片样式）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 采访向导（ReflectionInterview）

**Files:**
- Create: `src/components/reflection/ReflectionInterview.tsx`

**Interfaces:**
- Consumes: `usePlanningStore` (`activities`, `profile`)（已存在）；`buildSphereNodes`（`@/components/graph/sphere-model`，已存在）；`REFLECTION_TEMPLATE`、`pickFollowUp`、`coverageFromDraft`、`generateReflectionSummary`（Task 3）；`applyReflectionDraft`、`parseReflectionEdges`（Task 4）；`AttachmentPicker`（Task 5）；`ReflectionConfirmCard`（Task 6）
- Produces: `<ReflectionInterview initialActivityId={string|undefined} onDone={(reflection: Reflection) => void} onCancel={() => void} />`

- [ ] **Step 1: 创建 `src/components/reflection/ReflectionInterview.tsx`**

```tsx
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePlanningStore } from '@/stores/planningStore'
import { buildSphereNodes } from '@/components/graph/sphere-model'
import { coverageFromDraft, generateReflectionSummary, pickFollowUp, REFLECTION_TEMPLATE } from '@/lib/ai/reflection-ai'
import { applyReflectionDraft, parseReflectionEdges } from '@/lib/ai/proposals'
import { AttachmentPicker } from './AttachmentPicker'
import { ReflectionConfirmCard } from './ReflectionConfirmCard'
import type { Reflection, ReflectionAttachment, ReflectionProposedEdge, ReflectionQA, ReflectionTrigger } from '@/types'

type Step =
  | { kind: 'choose' }
  | { kind: 'draft-write' }
  | { kind: 'qa'; question: string; followUpsLeft: number }
  | { kind: 'summarizing' }
  | { kind: 'confirm'; summary: string; edges: ReflectionProposedEdge[] }

interface ReflectionInterviewProps {
  initialActivityId?: string
  onDone: (reflection: Reflection) => void
  onCancel: () => void
}

const MAX_FOLLOW_UPS = 2

/** 反思采访向导：选关联活动/进入方式 → 逐题问答（含追问）→ AI 总结确认卡 → 入库 */
export function ReflectionInterview({ initialActivityId, onDone, onCancel }: ReflectionInterviewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)

  const [activityId, setActivityId] = useState(initialActivityId ?? '')
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [qa, setQa] = useState<ReflectionQA[]>([])
  const [templateQueue, setTemplateQueue] = useState<number[]>([])
  const [answerDraft, setAnswerDraft] = useState('')
  const [attachment, setAttachment] = useState<ReflectionAttachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [trigger, setTrigger] = useState<ReflectionTrigger>('freeform')

  const activity = activities.find((a) => a.id === activityId)

  const startAiInterview = () => {
    setTrigger(activityId ? 'activity' : 'freeform')
    setTemplateQueue(REFLECTION_TEMPLATE.map((_, i) => i).slice(1))
    setStep({ kind: 'qa', question: REFLECTION_TEMPLATE[0], followUpsLeft: MAX_FOLLOW_UPS })
  }

  const startDraft = () => {
    setTrigger(activityId ? 'activity' : 'freeform')
    setStep({ kind: 'draft-write' })
  }

  const runSummarize = async (finalQa: ReflectionQA[]) => {
    setStep({ kind: 'summarizing' })
    try {
      const nodes = buildSphereNodes(activities, profile)
      const otherLabels = nodes.filter((n) => n.id !== `activity:${activityId}`).map((n) => n.label)
      const result = await generateReflectionSummary({
        qa: finalQa,
        activityTitle: activity?.title,
        otherLabels,
      })
      const edges = parseReflectionEdges(result)
      setStep({ kind: 'confirm', summary: result.summary, edges })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 生成总结失败')
      setStep({ kind: 'choose' })
    }
  }

  const submitDraft = async () => {
    const draft = answerDraft.trim()
    if (!draft) return
    setBusy(true)
    try {
      const initialQa: ReflectionQA[] = [{ question: '（自由书写）', answer: draft }]
      const covered = await coverageFromDraft(draft)
      const remaining = REFLECTION_TEMPLATE.map((_, i) => i).filter((i) => !covered.includes(i))
      setQa(initialQa)
      setAnswerDraft('')
      if (remaining.length === 0) {
        await runSummarize(initialQa)
        return
      }
      setTemplateQueue(remaining.slice(1))
      setStep({ kind: 'qa', question: REFLECTION_TEMPLATE[remaining[0]], followUpsLeft: MAX_FOLLOW_UPS })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 分析草稿失败')
    } finally {
      setBusy(false)
    }
  }

  const advanceQueue = async (nextQa: ReflectionQA[]) => {
    if (templateQueue.length === 0) {
      await runSummarize(nextQa)
      return
    }
    const [nextIndex, ...rest] = templateQueue
    setTemplateQueue(rest)
    setStep({ kind: 'qa', question: REFLECTION_TEMPLATE[nextIndex], followUpsLeft: MAX_FOLLOW_UPS })
  }

  const submitAnswer = async () => {
    if (step.kind !== 'qa') return
    const answer = answerDraft.trim()
    if (!answer) return
    const nextQa = [...qa, { question: step.question, answer }]
    setQa(nextQa)
    setAnswerDraft('')
    setBusy(true)
    try {
      if (step.followUpsLeft > 0) {
        const followUp = await pickFollowUp(nextQa, step.question, answer)
        if (followUp) {
          setStep({ kind: 'qa', question: followUp, followUpsLeft: step.followUpsLeft - 1 })
          return
        }
      }
      await advanceQueue(nextQa)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 追问失败，跳过这一步')
      await advanceQueue(nextQa)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (summary: string, edges: ReflectionProposedEdge[]) => {
    const reflection = await applyReflectionDraft({
      title: activity ? `反思：${activity.title}` : `反思 · ${new Date().toLocaleDateString('zh-CN')}`,
      trigger,
      activityId: activityId || undefined,
      qa,
      summary,
      attachments: attachment ? [attachment] : [],
      edges,
    })
    onDone(reflection)
  }

  if (step.kind === 'choose') {
    return (
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <div>
          <p className="mb-1 text-sm font-medium">关联到活动（可选）</p>
          <Select value={activityId || '__none__'} onValueChange={(v) => setActivityId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-8 w-full" size="sm">
              <SelectValue placeholder="不关联，独立日记" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不关联，独立日记</SelectItem>
              {activities.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">配图（可选）</p>
          <AttachmentPicker attachment={attachment} onChange={setAttachment} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={startAiInterview}>
            <Sparkles className="size-3.5" />
            AI 带我采访
          </Button>
          <Button size="sm" variant="outline" onClick={startDraft}>
            自己先写草稿
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  if (step.kind === 'draft-write') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">写下你的反思草稿</p>
        <Textarea
          autoFocus
          value={answerDraft}
          onChange={(e) => setAnswerDraft(e.target.value)}
          placeholder="随便写，AI 会根据模板补问你还没提到的点"
          className="min-h-32 text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !answerDraft.trim()} onClick={() => void submitDraft()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : '提交草稿'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  if (step.kind === 'qa') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">{step.question}</p>
        <Textarea autoFocus value={answerDraft} onChange={(e) => setAnswerDraft(e.target.value)} className="min-h-20 text-sm" />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !answerDraft.trim()} onClick={() => void submitAnswer()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : '下一步'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  if (step.kind === 'summarizing') {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        AI 正在整理反思总结…
      </div>
    )
  }

  return (
    <ReflectionConfirmCard
      summary={step.summary}
      edges={step.edges}
      onConfirm={(summary, edges) => void confirm(summary, edges)}
      onCancel={onCancel}
    />
  )
}
```

- [ ] **Step 2: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/components/reflection/ReflectionInterview.tsx
git commit -m "$(cat <<'EOF'
feat(S4b): 反思采访向导——选活动/模式 → 模板问答+追问 → AI 总结确认卡

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Reflection Studio 视图 + 导航接入（S4b 收尾）

**Files:**
- Create: `src/components/reflection/ReflectionStudioView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ReflectionInterview`（Task 7）；`useReflectionUiStore`（Task 5）；`usePlanningStore` (`reflections`, `activities`, `removeReflection`)（Task 1）；`getAttachmentURL`（Task 2）
- Produces: `<ReflectionStudioView onNavigate={(view: AppView) => void} />`；侧栏「反思」导航项；`App.tsx` 挂载 `view === 'reflection'`

- [ ] **Step 1: 创建 `src/components/reflection/ReflectionStudioView.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ImageIcon, NotebookPen, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { getAttachmentURL } from '@/lib/storage/opfs'
import { ReflectionInterview } from './ReflectionInterview'
import type { AppView, Reflection } from '@/types'

interface ReflectionStudioViewProps {
  onNavigate: (view: AppView) => void
}

const TRIGGER_LABEL: Record<Reflection['trigger'], string> = {
  activity: '关联活动',
  freeform: '独立日记',
  agent: '学栖提醒',
}

/** 反思工作室：列表 + 开始新反思（独立采访视图，不与主聊天共用界面） */
export function ReflectionStudioView({ onNavigate }: ReflectionStudioViewProps) {
  const reflections = usePlanningStore((s) => s.reflections)
  const activities = usePlanningStore((s) => s.activities)
  const removeReflection = usePlanningStore((s) => s.removeReflection)
  const pendingActivityId = useReflectionUiStore((s) => s.pendingActivityId)
  const pendingOpenId = useReflectionUiStore((s) => s.pendingOpenId)

  const [creating, setCreating] = useState(false)
  const [presetActivityId, setPresetActivityId] = useState<string | undefined>(undefined)
  const [openId, setOpenId] = useState<string | null>(null)

  // 从活动卡「反思一下」/星图卫星/提醒卡跳转：带上预置的上下文。
  // 从 getState() 复核最新值：StrictMode 下 effect 会连跑两次，第二次已被清空，避免重复触发。
  useEffect(() => {
    const store = useReflectionUiStore.getState()
    if (store.pendingActivityId) {
      setPresetActivityId(store.pendingActivityId)
      setCreating(true)
      store.setPendingActivityId(null)
    }
    if (store.pendingOpenId) {
      setOpenId(store.pendingOpenId)
      store.setPendingOpenId(null)
    }
  }, [pendingActivityId, pendingOpenId])

  const openReflection = reflections.find((r) => r.id === openId)

  const startNew = () => {
    setPresetActivityId(undefined)
    setCreating(true)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold">反思</h1>
            <p className="text-sm text-muted-foreground">
              {reflections.length > 0 ? `${reflections.length} 条反思` : 'AI 采访式反思，记录经历背后的思考'}
            </p>
          </div>
          {!creating && (
            <Button size="sm" className="gap-1.5" onClick={startNew}>
              <Plus className="size-3.5" />
              开始新反思
            </Button>
          )}
        </header>

        {creating && (
          <ReflectionInterview
            initialActivityId={presetActivityId}
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        )}

        {openReflection && (
          <ReflectionDetail
            reflection={openReflection}
            onClose={() => setOpenId(null)}
            onDelete={() => {
              void removeReflection(openReflection.id)
              setOpenId(null)
            }}
          />
        )}

        <div className="flex flex-col gap-2">
          {reflections.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/30"
              onClick={() => setOpenId(r.id)}
            >
              <NotebookPen className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {TRIGGER_LABEL[r.trigger]}
                  </Badge>
                  {r.attachments.length > 0 && <ImageIcon className="size-3 text-muted-foreground" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
              </div>
            </button>
          ))}
          {reflections.length === 0 && !creating && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <p>
                还没有反思。
                {activities.length > 0 ? '点「开始新反思」，或去活动页对某个经历「反思一下」。' : '点「开始新反思」写下第一条。'}
              </p>
              {activities.length === 0 && (
                <Button size="sm" variant="outline" onClick={() => onNavigate('activities')}>
                  去添加活动
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReflectionDetail({
  reflection,
  onClose,
  onDelete,
}: {
  reflection: Reflection
  onClose: () => void
  onDelete: () => void
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    const attachment = reflection.attachments[0]
    if (!attachment) {
      setImageUrl(null)
      return
    }
    let url: string | null = null
    void getAttachmentURL(attachment.ref).then((u) => {
      url = u
      setImageUrl(u)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [reflection.attachments])

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium">{reflection.title}</h2>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            删除
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
      {imageUrl && <img src={imageUrl} alt="反思附图" className="max-h-48 rounded-md border object-cover" />}
      <p className="text-sm">{reflection.summary}</p>
      <div className="flex flex-col gap-2 border-t pt-2">
        {reflection.qa.map((qa, i) => (
          <div key={i} className="text-xs">
            <p className="font-medium text-muted-foreground">{qa.question}</p>
            <p>{qa.answer}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `src/App.tsx` — 挂载视图**

把：

```ts
import { GraphView } from '@/components/graph/GraphView'
```

改为：

```ts
import { GraphView } from '@/components/graph/GraphView'
import { ReflectionStudioView } from '@/components/reflection/ReflectionStudioView'
```

把：

```tsx
        {view === 'graph' && <GraphView onNavigate={setView} />}
```

改为：

```tsx
        {view === 'graph' && <GraphView onNavigate={setView} />}
        {view === 'reflection' && <ReflectionStudioView onNavigate={setView} />}
```

- [ ] **Step 3: `src/components/layout/Sidebar.tsx` — 解禁「反思」导航项**

把：

```ts
/** 后续阶段的模块入口占位（S4 反思、S5 技能） */
const UPCOMING_MODULES = [
  { icon: NotebookPen, label: '反思', stage: 'S4' },
  { icon: Puzzle, label: '技能', stage: 'S5' },
]
```

改为：

```ts
/** 后续阶段的模块入口占位（S5 技能） */
const UPCOMING_MODULES = [{ icon: Puzzle, label: '技能', stage: 'S5' }]
```

在「成果网络」`NavItem` 之后（`</nav>` 之前）加一个真实导航项：

```tsx
        <NavItem
          icon={NotebookPen}
          label="反思"
          active={view === 'reflection'}
          onClick={() => onViewChange('reflection')}
        />
```

- [ ] **Step 4: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 5: 手动浏览器验证**

用 preview 工具启动 dev server，打开应用：
1. 点侧栏「反思」，应看到空态"还没有反思"。
2. 先去「活动」新增一个测试活动（若还没有）。
3. 回「反思」点「开始新反思」，选中该活动，点「AI 带我采访」。
4. 依次回答几题，观察是否有追问出现（若无追问也正常，AI 判断）；答完 6 题后应进入"AI 正在整理反思总结…"再到确认卡。
5. 确认卡上编辑一下总结文字，点「确认保存」，应返回列表并看到新增的一条反思。
6. 点这条反思，应展开详情（总结 + 完整问答）；点「删除」应移除。
7. 再试一次「自己先写草稿」路径，确认能正常走到确认卡。
8. 若浏览器支持 OPFS：在"选活动/模式"这一步给"配图"上传一张图片，确认预览显示；反思保存后详情页应显示这张图。

- [ ] **Step 6: 更新 README 版本记录（S4b 收尾）**

在版本记录表格最上方插入：

```
| S4b | 2026-07-20 | Reflection Studio：AI 采访式反思（固定模板+追问/自写草稿两种入口）+ 单图附件 + 确认卡入库，侧栏「反思」解禁 | feat |
```

- [ ] **Step 7: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/components/reflection/ReflectionStudioView.tsx src/App.tsx src/components/layout/Sidebar.tsx README.md
git commit -m "$(cat <<'EOF'
feat(S4b): Reflection Studio 视图 + 导航接入，S4b 阶段完成

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 星图卫星坐标（sphere-model.ts）

**Files:**
- Modify: `src/components/graph/sphere-model.ts`

**Interfaces:**
- Consumes: `Reflection` 类型（Task 1）
- Produces: `SphereNodeKind` 新增 `'reflection'`；`buildSphereNodes(activities, profile, shellOverride?, reflections?)` 新增第 4 个可选参数；`projectNodes` 对 `kind==='reflection'` 的节点给更小半径与更低透明度

- [ ] **Step 1: 类型导入 + 新增常量**

把：

```ts
import type { Activity, ActivityCategory, StudentProfile } from '@/types'

export type SphereNodeKind = 'major' | 'activity' | 'course'
```

改为：

```ts
import type { Activity, ActivityCategory, Reflection, StudentProfile } from '@/types'

export type SphereNodeKind = 'major' | 'activity' | 'course' | 'reflection'
```

找到：

```ts
const COURSE_HEX = '#94a3b8'
```

改为（新增反思专属色 + 卫星偏移半径）：

```ts
const COURSE_HEX = '#94a3b8'
const REFLECTION_HEX = '#8890b5'
/** 反思卫星绕父活动的偏移半径（同一 XZ 平面内的小环，与父活动同一层，不参与轨道分层系统） */
const SATELLITE_RADIUS = 34
```

- [ ] **Step 2: `buildSphereNodes` 加反思参数**

把函数签名：

```ts
export function buildSphereNodes(
  activities: Activity[],
  profile: StudentProfile | null,
  shellOverride: Record<string, number> = {},
): SphereNode[] {
```

改为：

```ts
export function buildSphereNodes(
  activities: Activity[],
  profile: StudentProfile | null,
  shellOverride: Record<string, number> = {},
  reflections: Reflection[] = [],
): SphereNode[] {
```

在 courses 的 `for` 循环之后（`// 按层分组后分配球面坐标` 注释之前）加入未关联活动的反思，并入标准分层：

```ts
  for (const c of profile?.courses ?? []) {
    const id = `course:${c.id}`
    raw.push({
      id,
      kind: 'course',
      label: c.name,
      sublabel: c.level || undefined,
      shell: shellOverride[id] ?? 2,
      color: COURSE_HEX,
    })
  }
  // 未关联活动的反思：并入外层未分类区，走标准分层（建立关联后会被下面的卫星逻辑接管）
  for (const r of reflections.filter((x) => !x.activityId)) {
    const id = `reflection:${r.id}`
    raw.push({
      id,
      kind: 'reflection',
      label: r.title,
      shell: shellOverride[id] ?? 3,
      color: REFLECTION_HEX,
    })
  }
```

（这里替换的是原本 courses 循环到分组注释之间的这段——把原来的 courses 循环保留，只在它后面追加上面这段新代码。）

在函数末尾、`return nodes` 之前（即 by-shell 分组的 `for...of byShell` 循环结束之后）插入反思卫星逻辑：

```ts
  // 关联到活动的反思：作为卫星，基准坐标 = 父活动坐标 + 小半径偏移，复用同一套旋转/投影管线
  const linkedByActivity = new Map<string, Reflection[]>()
  for (const r of reflections) {
    if (!r.activityId) continue
    const list = linkedByActivity.get(r.activityId) ?? []
    list.push(r)
    linkedByActivity.set(r.activityId, list)
  }
  for (const [activityId, list] of linkedByActivity) {
    const parent = nodes.find((n) => n.id === `activity:${activityId}`)
    if (!parent) continue
    list.forEach((r, i) => {
      const [ox, oy, oz] = ringPoint(i, list.length, SATELLITE_RADIUS, 0.3)
      nodes.push({
        id: `reflection:${r.id}`,
        kind: 'reflection',
        label: r.title,
        shell: -1,
        color: REFLECTION_HEX,
        base: [parent.base[0] + ox, parent.base[1] + oy, parent.base[2] + oz],
      })
    })
  }

  return nodes
```

- [ ] **Step 3: `projectNodes` 给反思节点更小更暗**

把：

```ts
    const t = (z2 + maxR) / (2 * maxR) // 0..1
    const baseR = n.shell === 0 ? 24 : n.shell === 1 ? 16 : n.shell === 2 ? 12 : 9
    // 中心专业方向恒定最大最亮；其余按深度渐变
    const isCenter = n.shell === 0
    const depthScale = isCenter ? 1.1 : 0.62 + t * 0.6
    return {
      ...n,
      sx: cx + x1 * zoom,
      sy: cy + y2 * zoom,
      depth: isCenter ? maxR + 1 : z2, // 中心始终渲染在最前
      t,
      radius: baseR * depthScale * zoom,
      opacity: isCenter ? 1 : 0.45 + t * 0.55,
    }
```

改为：

```ts
    const t = (z2 + maxR) / (2 * maxR) // 0..1
    const isCenter = n.shell === 0
    const isReflection = n.kind === 'reflection'
    // 反思卫星视觉上更小更暗，避免抢主星的视觉重量
    const baseR = isReflection ? 6 : n.shell === 0 ? 24 : n.shell === 1 ? 16 : n.shell === 2 ? 12 : 9
    const depthScale = isCenter ? 1.1 : 0.62 + t * 0.6
    const dim = isReflection ? 0.7 : 1
    return {
      ...n,
      sx: cx + x1 * zoom,
      sy: cy + y2 * zoom,
      depth: isCenter ? maxR + 1 : z2, // 中心始终渲染在最前
      t,
      radius: baseR * depthScale * zoom,
      opacity: (isCenter ? 1 : 0.45 + t * 0.55) * dim,
    }
```

- [ ] **Step 4: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/components/graph/sphere-model.ts
git commit -m "$(cat <<'EOF'
feat(S4c): 星图投影管线支持反思卫星节点——绕父活动小半径偏移，独立反思并入外层未分类区

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 星图接入反思节点渲染（S4c 收尾）

**Files:**
- Modify: `src/components/graph/GraphView.tsx`
- Modify: `src/components/graph/StarCard.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `buildSphereNodes(..., reflections)`（Task 9）；`useReflectionUiStore`（Task 5）；`usePlanningStore().reflections`（Task 1）
- Produces: 星图正常渲染反思卫星节点；点击反思星点弹出精简版详情卡，可跳转 Reflection Studio 查看完整内容

- [ ] **Step 1: `src/components/graph/GraphView.tsx` — 读取反思数据并传入 `buildSphereNodes`**

把：

```ts
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const narrativeEdges = usePlanningStore((s) => s.narrativeEdges)
  const graphMeta = usePlanningStore((s) => s.graphMeta)
```

改为：

```ts
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const narrativeEdges = usePlanningStore((s) => s.narrativeEdges)
  const graphMeta = usePlanningStore((s) => s.graphMeta)
  const reflections = usePlanningStore((s) => s.reflections)
```

把：

```ts
  const nodes = useMemo(() => buildSphereNodes(activities, profile, shellOverride), [activities, profile, shellOverride])
```

改为：

```ts
  const nodes = useMemo(
    () => buildSphereNodes(activities, profile, shellOverride, reflections),
    [activities, profile, shellOverride, reflections],
  )
```

把 `runAiLayout` 里的：

```ts
      const items = nodes
        .filter((n) => n.kind !== 'major')
        .map((n) => ({ id: n.id, label: n.label, kind: n.kind }))
```

改为（反思卫星不参与 AI 分层——它们的坐标由父活动决定，不走 shell 系统）：

```ts
      const items = nodes
        .filter((n) => n.kind !== 'major' && n.kind !== 'reflection')
        .map((n) => ({ id: n.id, label: n.label, kind: n.kind }))
```

把 `<NodeCard node={selectedNode} onClose={() => setSelected(null)} />` 改为：

```tsx
              <NodeCard node={selectedNode} onClose={() => setSelected(null)} onNavigate={onNavigate} />
```

- [ ] **Step 2: `src/components/graph/StarCard.tsx` — 反思节点的精简卡片分支**

把顶部导入：

```ts
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlanningStore } from '@/stores/planningStore'
import { regenerateEdgeReason, regenerateNodeBlurb } from '@/lib/ai/graph-ai'
import { effectiveMajors } from './sphere-model'
import type { NarrativeEdge } from '@/types'
import type { ProjectedNode } from './sphere-model'
```

改为：

```ts
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, NotebookPen, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlanningStore } from '@/stores/planningStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { regenerateEdgeReason, regenerateNodeBlurb } from '@/lib/ai/graph-ai'
import { effectiveMajors } from './sphere-model'
import type { AppView, NarrativeEdge } from '@/types'
import type { ProjectedNode } from './sphere-model'
```

把 `NodeCard` 的函数签名与开头几行：

```ts
export function NodeCard({ node, onClose }: { node: ProjectedNode; onClose: () => void }) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const graphMeta = usePlanningStore((s) => s.graphMeta)
  const setNodeMeta = usePlanningStore((s) => s.setNodeMeta)
  const updateProfile = usePlanningStore((s) => s.updateProfile)

  const meta = graphMeta[node.id]
```

改为：

```ts
export function NodeCard({
  node,
  onClose,
  onNavigate,
}: {
  node: ProjectedNode
  onClose: () => void
  onNavigate: (view: AppView) => void
}) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const reflections = usePlanningStore((s) => s.reflections)
  const graphMeta = usePlanningStore((s) => s.graphMeta)
  const setNodeMeta = usePlanningStore((s) => s.setNodeMeta)
  const updateProfile = usePlanningStore((s) => s.updateProfile)
  const setPendingOpenId = useReflectionUiStore((s) => s.setPendingOpenId)

  if (node.kind === 'reflection') {
    const reflection = reflections.find((r) => `reflection:${r.id}` === node.id)
    return (
      <CardFrame onClose={onClose}>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: node.color }} />
          <span className="font-medium">{node.label}</span>
        </div>
        <p className="line-clamp-4 text-xs text-muted-foreground">{reflection?.summary || '（反思内容缺失）'}</p>
        <div className="flex items-center gap-1 border-t pt-2">
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              if (reflection) setPendingOpenId(reflection.id)
              onNavigate('reflection')
            }}
          >
            <NotebookPen className="size-3" />
            查看完整反思
          </Button>
        </div>
      </CardFrame>
    )
  }

  const meta = graphMeta[node.id]
```

（`NodeCard` 剩余部分——`derived`/`detail`/`editing` 状态、`SHELL_CHIPS`、`CardActions` 等——原样保留，不用改。）

- [ ] **Step 3: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 4: 手动浏览器验证**

1. 在「反思」里对某个活动完成一次反思保存。
2. 去「成果网络」，应能看到一个更小更暗的星点紧贴在该活动星点附近（同一层，围绕它转的"卫星"观感）。
3. 点这个反思星点，应弹出精简卡片（标题 + 总结预览 + 「查看完整反思」按钮），不应出现"分层快捷设置"或"AI 重新生成"（那些是活动/课程节点专属）。
4. 点「查看完整反思」，应跳转到「反思」页并自动展开这条反思的详情。
5. 点「AI 整理」，确认不会把反思星点也纳入分层调整（正常情况下它就不在候选列表里，不会报错即可）。
6. 悬浮"全部事项"列表打开后，反思节点应出现在"已连接叙事线"或"尚未连接"分组里（若没有额外样式区分也可以，只要点了能正确定位）。

- [ ] **Step 5: 更新 README 版本记录（S4c 收尾）**

在版本记录表格最上方插入：

```
| S4c | 2026-07-20 | 成长星图接入反思节点：绕父活动的卫星坐标，点击弹出精简卡片跳转 Reflection Studio | feat |
```

- [ ] **Step 6: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/components/graph/GraphView.tsx src/components/graph/StarCard.tsx README.md
git commit -m "$(cat <<'EOF'
feat(S4c): 星图渲染反思卫星节点，点击跳转 Reflection Studio 查看完整内容，S4c 阶段完成

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 主动 Agent 催写反思规则 + Dashboard/活动页入口联动（S4d 收尾）

> 规则引擎改动（Step 1-2）与 Dashboard 消费方（Step 3）共享同一个类型改动（`Reminder.prompt` 改可选 + 新增 `reflectActivityId`），拆成两个任务会导致中间有一个编译不过的提交，所以合并成一个任务、一次性提交。

**Files:**
- Modify: `src/lib/engine/rules.ts`
- Modify: `src/stores/reminderStore.ts`
- Modify: `src/components/dashboard/DashboardView.tsx`
- Modify: `src/components/activities/ActivitiesView.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `Activity`、`Reflection` 类型（Task 1）；`usePlanningStore` (`activities`, `reflections`)（Task 1）；`useReflectionUiStore`（Task 5）
- Produces: `Reminder` 接口新增可选字段 `reflectActivityId`，`prompt` 改为可选；`computeReminders` 的 `input` 新增 `activities`、`reflections`；Dashboard 提醒卡按 `reflectActivityId`/`prompt` 分流跳转；反思/成果网络占位卡替换为真实统计卡；活动行新增「反思一下」按钮

- [ ] **Step 1: `src/lib/engine/rules.ts` — 新增 R5 规则**

把顶部类型导入：

```ts
import type { EventItem, StudentProfile, Task } from '@/types'
```

改为：

```ts
import type { Activity, EventItem, Reflection, StudentProfile, Task } from '@/types'
```

把 `Reminder` 接口：

```ts
export interface Reminder {
  /** 去重/关闭用（同规则同对象同 key） */
  key: string
  title: string
  body: string
  /** 点「去处理」后预置到对话的引导语 */
  prompt: string
}
```

改为：

```ts
export interface Reminder {
  /** 去重/关闭用（同规则同对象同 key） */
  key: string
  title: string
  body: string
  /** 点「去处理」后预置到对话的引导语；与 reflectActivityId 二选一 */
  prompt?: string
  /** 点「去处理」后跳转反思工作室并预填该活动；与 prompt 二选一 */
  reflectActivityId?: string
}
```

把常量区：

```ts
const DDL_LOOKAHEAD_DAYS = 7
const OVERLOAD_THRESHOLD = 5
const COMEBACK_DAYS = 3
```

改为：

```ts
const DDL_LOOKAHEAD_DAYS = 7
const OVERLOAD_THRESHOLD = 5
const COMEBACK_DAYS = 3
const REFLECTION_LOOKBACK_DAYS = 7
```

把 `computeReminders` 的签名与解构：

```ts
export function computeReminders(input: {
  profile: StudentProfile | null
  tasks: Task[]
  events: EventItem[]
  lastActiveAt?: number
}): Reminder[] {
  const { profile, tasks, events, lastActiveAt } = input
```

改为：

```ts
export function computeReminders(input: {
  profile: StudentProfile | null
  tasks: Task[]
  events: EventItem[]
  activities: Activity[]
  reflections: Reflection[]
  lastActiveAt?: number
}): Reminder[] {
  const { profile, tasks, events, activities, reflections, lastActiveAt } = input
```

在 R4（档案不完整）代码块之后、`return reminders` 之前加入 R5：

```ts

  // R5：活动已结束 ≥7 天且没有关联反思，提醒补写反思
  const reflectedActivityIds = new Set(reflections.map((r) => r.activityId).filter((id): id is string => !!id))
  const needsReflection = activities
    .filter((a) => a.endDate && daysUntil(a.endDate) <= -REFLECTION_LOOKBACK_DAYS && !reflectedActivityIds.has(a.id))
    .slice(0, 1)
  for (const a of needsReflection) {
    reminders.push({
      key: `reflect:${a.id}`,
      title: `要不要反思一下「${a.title}」？`,
      body: '这个活动已经结束一段时间了，趁记忆还新鲜，写一条反思记录下来。',
      reflectActivityId: a.id,
    })
  }
```

- [ ] **Step 2: `src/stores/reminderStore.ts` — 传入 activities/reflections**

把：

```ts
  init: async () => {
    const settings = await getSettings()
    const { profile, tasks, events } = usePlanningStore.getState()
    const all = computeReminders({ profile, tasks, events, lastActiveAt: settings.lastActiveAt })
```

改为：

```ts
  init: async () => {
    const settings = await getSettings()
    const { profile, tasks, events, activities, reflections } = usePlanningStore.getState()
    const all = computeReminders({ profile, tasks, events, activities, reflections, lastActiveAt: settings.lastActiveAt })
```

- [ ] **Step 3: `src/components/dashboard/DashboardView.tsx` — 提醒卡跳转分流 + 占位卡替换**

把顶部导入：

```ts
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  GraduationCap,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore, selectTodayTasks } from '@/stores/planningStore'
import { useReminderStore } from '@/stores/reminderStore'
import { daysUntil } from '@/lib/db/planning'
import { TaskRow } from '@/components/tasks/TaskRow'
import { formatCountdown } from '@/components/tasks/EventList'
import type { SettingsCategory } from '@/components/settings/SettingsDialog'
import { cn } from '@/lib/utils'
import { isProfileEmpty, type AppView } from '@/types'
```

改为：

```ts
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  GraduationCap,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore, selectTodayTasks } from '@/stores/planningStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { useReminderStore } from '@/stores/reminderStore'
import { daysUntil } from '@/lib/db/planning'
import { TaskRow } from '@/components/tasks/TaskRow'
import { formatCountdown } from '@/components/tasks/EventList'
import type { SettingsCategory } from '@/components/settings/SettingsDialog'
import { cn } from '@/lib/utils'
import { isProfileEmpty, type AppView } from '@/types'
import type { Reminder } from '@/lib/engine/rules'
```

把：

```ts
  const conversations = useChatStore((s) => s.conversations)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const tasks = usePlanningStore((s) => s.tasks)
  const events = usePlanningStore((s) => s.events)
  const profile = usePlanningStore((s) => s.profile)
  const todayTasks = selectTodayTasks(tasks)
```

改为：

```ts
  const conversations = useChatStore((s) => s.conversations)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const tasks = usePlanningStore((s) => s.tasks)
  const events = usePlanningStore((s) => s.events)
  const activities = usePlanningStore((s) => s.activities)
  const reflections = usePlanningStore((s) => s.reflections)
  const profile = usePlanningStore((s) => s.profile)
  const todayTasks = selectTodayTasks(tasks)
```

把：

```ts
  const reminders = useReminderStore((s) => s.reminders)
  const dismissReminder = useReminderStore((s) => s.dismiss)
  const handleReminder = (prompt: string, key: string) => {
    void dismissReminder(key)
    setPendingPrompt(prompt)
    onNavigate('chat')
  }
```

改为：

```ts
  const reminders = useReminderStore((s) => s.reminders)
  const dismissReminder = useReminderStore((s) => s.dismiss)
  const handleReminder = (r: Reminder) => {
    void dismissReminder(r.key)
    if (r.reflectActivityId) {
      useReflectionUiStore.getState().setPendingActivityId(r.reflectActivityId)
      onNavigate('reflection')
    } else if (r.prompt) {
      setPendingPrompt(r.prompt)
      onNavigate('chat')
    }
  }
```

把提醒卡按钮的：

```tsx
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleReminder(r.prompt, r.key)}>
```

改为：

```tsx
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleReminder(r)}>
```

把末尾的占位卡区块：

```tsx
          {/* 占位：S3/S4 */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Network className="size-4" />
                  成果网络
                </span>
                <Badge variant="secondary" className="text-[10px]">S3 推出</Badge>
              </CardTitle>
              <CardDescription>活动、课程与成果串成叙事网络</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <NotebookPen className="size-4" />
                  反思
                </span>
                <Badge variant="secondary" className="text-[10px]">S4 推出</Badge>
              </CardTitle>
              <CardDescription>活动结束后的 AI 采访式反思记录</CardDescription>
            </CardHeader>
          </Card>
```

改为（S3/S4 均已上线，替换成真实入口卡，风格对齐上面「今日任务」「近期 DDL」两张卡）：

```tsx
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Network className="size-4" />
                  成果网络
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate('graph')}>
                  查看
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {activities.length > 0 ? `${activities.length} 个活动，串成成长星图` : '添加活动后，星图会自动生成'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <NotebookPen className="size-4" />
                  反思
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate('reflection')}>
                  查看
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {reflections.length > 0 ? `已写下 ${reflections.length} 条反思` : 'AI 采访式反思，记录经历背后的思考'}
              </p>
            </CardContent>
          </Card>
```

- [ ] **Step 4: `src/components/activities/ActivitiesView.tsx` — 活动行「反思一下」按钮**

把顶部导入：

```ts
import { useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
```

改为：

```ts
import { useState } from 'react'
import { NotebookPen, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useChatStore } from '@/stores/chatStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { cn } from '@/lib/utils'
```

把渲染活动行的地方：

```tsx
              <ActivityRow
                key={a.id}
                activity={a}
                onEdit={() => {
                  setDraft(activityToDraft(a))
                  setAdding(false)
                  setEditingId(a.id)
                }}
                onDelete={() => void removeActivity(a.id)}
              />
```

改为：

```tsx
              <ActivityRow
                key={a.id}
                activity={a}
                onEdit={() => {
                  setDraft(activityToDraft(a))
                  setAdding(false)
                  setEditingId(a.id)
                }}
                onDelete={() => void removeActivity(a.id)}
                onReflect={() => {
                  useReflectionUiStore.getState().setPendingActivityId(a.id)
                  onNavigate('reflection')
                }}
              />
```

把 `ActivityRow` 的函数签名：

```tsx
function ActivityRow({
  activity,
  onEdit,
  onDelete,
}: {
  activity: Activity
  onEdit: () => void
  onDelete: () => void
}) {
```

改为：

```tsx
function ActivityRow({
  activity,
  onEdit,
  onDelete,
  onReflect,
}: {
  activity: Activity
  onEdit: () => void
  onDelete: () => void
  onReflect: () => void
}) {
```

把行内的操作按钮组：

```tsx
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="size-7" aria-label="编辑活动" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="删除活动" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
```

改为：

```tsx
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="size-7" aria-label="反思一下" onClick={onReflect}>
          <NotebookPen className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="编辑活动" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="删除活动" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
```

- [ ] **Step 5: 编译检查**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过。

- [ ] **Step 6: 手动浏览器验证**

1. 打开 Dashboard，确认「成果网络」「反思」两张卡不再显示"S3/S4 推出"占位角标，而是真实统计文字 + 「查看」按钮，点击能正确跳转。
2. 去「活动」页，鼠标悬停在某个活动行上，应出现「反思一下」图标按钮（在编辑/删除左边），点击应跳转「反思」页并自动带出该活动、直接进入新建反思流程。
3. R5 规则的真实触发条件是"活动结束 ≥7 天且无反思"，本地手动测试时可以临时把某个测试活动的 `endDate` 改成 8 天前（在活动编辑表单里改日期），刷新页面后回 Dashboard，应看到"要不要反思一下「XX」？"提醒卡；点「去处理」应直接跳「反思」页并带出该活动；点右侧 X 应能正常关闭且当天不再出现。验证完把这个测试活动的日期改回去或删掉。

- [ ] **Step 7: 更新 README 版本记录（S4d 收尾）**

在版本记录表格最上方插入两行（S4d 收尾 + S4 阶段完成 milestone）：

```
| S4 | 2026-07-20 | S4 阶段完成：Reflection Studio（AI 采访式反思）+ OPFS 单图附件 + 星图卫星接入 + 主动催写反思 | milestone |
| S4d | 2026-07-20 | 主动 Agent 催写反思规则 + Dashboard 提醒卡跳转分流 + 反思/成果网络占位卡替换为真实入口 + 活动页「反思一下」入口 | feat |
```

- [ ] **Step 8: Commit**

```bash
cd /Users/billgao/Documents/Coding/student-agent
git add src/lib/engine/rules.ts src/stores/reminderStore.ts src/components/dashboard/DashboardView.tsx src/components/activities/ActivitiesView.tsx README.md
git commit -m "$(cat <<'EOF'
feat(S4d): 主动 Agent 催写反思规则 + Dashboard/活动页入口联动，S4 阶段完成

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 端到端验证 + Obsidian 计划同步

**Files:**
- Modify: `/Users/billgao/Library/Mobile Documents/iCloud~md~obsidian/Documents/BillVault/Projects/student-agent-plan.md`

**Interfaces:**
- Consumes: 全部 S4 功能（Task 1-11）
- Produces: 无代码产出，纯验证 + 外部文档同步

- [ ] **Step 1: 完整走一遍 S4 主流程（浏览器）**

用 preview 工具启动 dev server，按顺序验证：
1. 新增一个活动 → 在活动页点「反思一下」→ 选「自己先写草稿」→ 提交草稿 → 观察是否有补问 → 走到确认卡 → 保存。
2. 去「成果网络」确认反思卫星出现在该活动旁边，点击能查看摘要并跳回「反思」页。
3. 去「反思」页直接点「开始新反思」，不选活动（独立日记），走「AI 带我采访」全流程，确认追问最多出现但不会死循环、总能走到总结确认卡。
4. 导出 JSON 备份（设置 → 数据 → 导出），检查文件里包含 `reflections` 字段且内容完整；清空浏览器数据后导入该备份，确认反思条目和图片附件引用都能恢复（图片文件本身在 OPFS 里，清空浏览器数据会连 OPFS 一起清掉，这是预期行为，不需要额外处理——记录这一点即可，不用改代码）。
5. 检查控制台无报错（`read_console_messages`，`onlyErrors: true`）。

若发现任何 bug，回到对应 Task 的文件定位修复，修复后追加一次 `fix:` commit（不需要新的版本号，除非用户明确要求）。

- [ ] **Step 2: 同步 Obsidian 计划文档**

Read `/Users/billgao/Library/Mobile Documents/iCloud~md~obsidian/Documents/BillVault/Projects/student-agent-plan.md`，把路线图里 S4 的状态从"未开始"更新为已完成（标注日期 2026-07-20），描述改为「Reflection Studio（AI 采访式反思）+ OPFS 单图附件 + 星图卫星接入 + 主动催写反思，四个子阶段 S4a-S4d 全部完成」，紧跟在 S3 完成记录之后，风格与文档里已有的 S1/S2/S3 完成记录保持一致。

- [ ] **Step 3: 最终确认**

Run: `cd /Users/billgao/Documents/Coding/student-agent && npm run build`
Expected: 编译通过，工作区无未提交的代码改动（`git status` 干净，或只剩 Obsidian 文档的改动，该文档不在本仓库内不需要 commit）。
