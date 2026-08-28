import { daysUntil, isoToday } from '@/lib/db/dates'
import { priorTakeaway, shallowEvents } from './depth'
import { mainlineDrift } from './mainline'
import { getSkill } from '@/lib/skills'
import { EVENT_CATEGORY_LABEL, isProfileEmpty } from '@/types'
import type { Artifact, GrowthEvent, StudentProfile } from '@/types'

/**
 * 主动式 Agent v1：本地规则引擎。
 * 打开应用时计算，命中的规则渲染为聊天顶部的提醒条；
 * 「去处理」带 prompt 进入对话。规则声明式定义，后续阶段扩充。
 */

export interface Reminder {
  /** 去重/关闭用（同规则同对象同 key） */
  key: string
  title: string
  body: string
  /** 点「去处理」后预置到对话的引导语；与 suggestSkillName 二选一 */
  prompt?: string
  /** 点「去处理」后激活该 skill 并带 prompt 跳转对话 */
  suggestSkillName?: string
}

const DDL_LOOKAHEAD_DAYS = 7
const OVERLOAD_THRESHOLD = 5
const COMEBACK_DAYS = 3
const REFLECTION_LOOKBACK_DAYS = 7
const ADMISSIONS_READER_MIN_EVENTS = 3
const CARRYOVER_WINDOW_DAYS = 14
const QUOTE_MAX_CHARS = 60
/** 主线原话在 body 里的字数上限 */
const MAINLINE_QUOTE_MAX = 24
/** body 里列举的事项标题字数上限 */
const MAINLINE_TITLE_MAX = 12
/** body 里最多列几个标题 */
const MAINLINE_LIST_MAX = 2
/** body 里最多列几个类别名 */
const SCOPE_MAX = 3

/**
 * key 里**一个变量都不能有**。
 *
 * 写成 `mainline:${count}` 或嵌事项 id，他关掉之后当天再记一条就换出新 key，
 * 同一天能弹五次——那正好是「记录之后打断他」；嵌主线文本则会让他每改一次主线、
 * 已经关掉的提醒就以新身份复活。
 */
export const MAINLINE_REMINDER_KEY = 'mainline'

const isTask = (e: GrowthEvent) => e.kind === 'short' && e.category === 'task'
const isSchedule = (e: GrowthEvent) => e.kind === 'short' && e.category !== 'task'

export function computeReminders(input: {
  profile: StudentProfile | null
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  usedSkillNames?: string[]
  lastActiveAt?: number
  mainlineShownAt?: number
}): Reminder[] {
  const { profile, growthEvents, artifacts, usedSkillNames = [], lastActiveAt, mainlineShownAt } = input
  const reminders: Reminder[] = []
  const pendingTasks = growthEvents.filter((e) => isTask(e) && e.status === 'pending')
  const longEvents = growthEvents.filter((e) => e.kind === 'long')

  // R1：DDL 临近（≤7 天）但没有任何关联任务
  const urgent = growthEvents
    .filter((e) => isSchedule(e) && e.status === 'pending')
    .filter((e) => {
      const d = daysUntil(e.startDate)
      return d >= 0 && d <= DDL_LOOKAHEAD_DAYS
    })
    .filter((e) => !pendingTasks.some((t) => t.parentId === e.id))
    .slice(0, 2)
  for (const e of urgent) {
    const days = daysUntil(e.startDate)
    reminders.push({
      key: `ddl-no-tasks:${e.id}`,
      title: `「${e.title}」${days === 0 ? '就是今天' : `还有 ${days} 天`}`,
      body: '这个日程还没有任何关联任务，要不要拆解一下准备计划？',
      prompt: `「${e.title}」在 ${e.startDate}（${days === 0 ? '今天' : `还有 ${days} 天`}），还没有安排任何准备任务。帮我拆解成具体的任务并安排到日程里。`,
    })
  }

  // R2：今日任务积压
  const todayPending = pendingTasks.filter((t) => t.startDate <= isoToday())
  if (todayPending.length > OVERLOAD_THRESHOLD) {
    reminders.push({
      key: 'overload',
      title: `今日待办有 ${todayPending.length} 条`,
      body: '任务有点多，要不要让学栖帮你按优先级重排或顺延一部分？',
      prompt: `我今天有 ${todayPending.length} 条待办任务，感觉做不完。帮我看看现有事项（用 get_events），按优先级重排，把可以延后的顺延。`,
    })
  }

  // R3：回归提醒（≥3 天未打开）
  if (lastActiveAt) {
    const awayDays = Math.floor((Date.now() - lastActiveAt) / 86400000)
    if (awayDays >= COMEBACK_DAYS) {
      reminders.push({
        key: 'comeback',
        title: `欢迎回来，离开了 ${awayDays} 天`,
        body: '要不要快速过一遍这几天积累的任务和临近的 DDL？',
        prompt: `我有 ${awayDays} 天没打开学栖了。帮我梳理一下当前的事项（用 get_events），告诉我现在最该做什么。`,
      })
    }
  }

  // R4：档案不完整（完全空的情况由聊天空态的建档 CTA 负责）
  if (profile && !isProfileEmpty(profile)) {
    const missing: string[] = []
    if (profile.courses.length === 0) missing.push('在读课程')
    if (profile.targetSchools.length === 0) missing.push('目标学校')
    if (missing.length > 0) {
      reminders.push({
        key: 'profile-incomplete',
        title: '档案还差一点',
        body: `补全${missing.join('和')}后，学栖的规划建议会更有针对性。`,
        prompt: `我的档案还缺${missing.join('和')}，请像采访一样一步步引导我补全，然后用 propose_profile_update 更新。`,
      })
    }
  }

  /**
   * R5：结束 ≥7 天、还停在第一层（只有履历）的长期事项。
   *
   * 判的是**长到第几层**而不是「有没有关联反思」——两者常常不一样：
   * 一份只记了「参加了什么」的反思在旧口径下算「有了」，但那段经历其实
   * 什么也没长出来。
   *
   * 措辞是**陈述**不是催促：说的是「这段还只有履历」，不是「你还没写反思」。
   * 而且**一次只提一条**——同时指出五段没消化的经历，那是一张待办清单，
   * 不是一个提醒。
   *
   * **只在第一层提醒，第二层不提。** 第二层（写了做了什么、没写下次会怎么做）
   * 看着也「没长出东西」，但催那一步等于催他现在就总结出一个道理——
   * 而一句为了填格子编出来的「我学会了团队协作」比空着有害得多。
   * 第一层不一样：一件做过的事一个字都没记，那是实打实的缺口。
   * 第二层到第三层是他自己的判断，不该由提醒条推着走。
   */
  const shallow = shallowEvents(longEvents, artifacts)
    .filter((e) => e.endDate && daysUntil(e.endDate) <= -REFLECTION_LOOKBACK_DAYS)
    .slice(0, 1)
  for (const e of shallow) {
    reminders.push({
      key: `reflect:${e.id}`,
      title: `「${e.title}」还只有一行履历`,
      body: '做过什么、卡在哪、下次会怎么做——这些还没记下来。趁记得清楚聊一聊，以后用得上。',
      prompt: `带我把「${e.title}」这段经历聊清楚：一次问我一个问题，问完用 propose_artifact 存下来，takeaway 只写我自己说过的「下次会怎么做」，我没说就留空。`,
    })
  }

  /**
   * R7：**开始一件同类的新事情时，把上一次那句「下次会怎么做」推回来。**
   *
   * 这一条是「记录」阶段的收口。14 让记录看得见，但看得见还不够——
   * 一份只在他想起来去翻的时候才有用的记录，和一张表格没有区别。
   * 记录要真的帮到人，就得在**下一次做决定的现场**自己出现。
   *
   * **引的必须是原话，不是我们的总结。** 转述一次那句话就不再是他的了，
   * 而「他自己说过的话」正是它有说服力的全部理由——同样一句「先定个交叉核对的规矩」
   * 由我们说出来是一条建议，由他半年前的自己说出来是一次兑现。
   *
   * 窗口取 14 天：新建一个长期事项之后的两周里，这件事还在「怎么开头」的阶段，
   * 推过去接得上；两周之后他已经上手了，再拿旧话去拦是马后炮。
   *
   * 摆在 R5 后面是有意的——两条都在讲记录，R5 说「这段还没长出东西」，
   * R7 说「上次长出来的东西现在用得上」，挨着看才是一件事的两面。
   */
  const startingFresh = longEvents
    // 已经结束的不推：那是在补录历史，不是在开始一件事，没有「这次要不要」可言
    .filter((e) => !e.endDate || daysUntil(e.endDate) >= 0)
    .filter((e) => Date.now() - e.createdAt <= CARRYOVER_WINDOW_DAYS * 86400000)
    .sort((a, b) => b.createdAt - a.createdAt)
  for (const e of startingFresh) {
    const prior = priorTakeaway(e, longEvents, artifacts)
    if (!prior) continue
    reminders.push({
      key: `carryover:${e.id}:${prior.event.id}`,
      title: `开始「${e.title}」之前`,
      // 引号后面接破折号而不是句号：原话本身常常自带句号，「…定下来。」。 这种叠标点
      // 一眼就看得出是拼出来的；而**修掉原话末尾的句号又等于改了他的字**
      body: `上次做「${prior.event.title}」你写过：「${quoteVerbatim(prior.takeaway)}」——这次要不要先照这句话定个规矩？`,
      // prompt 里给**完整**原话，不给截断版：提醒条要短，但真进了对话就没有理由再省
      prompt: `我要开始「${e.title}」。上次做「${prior.event.title}」的时候我写过：「${prior.takeaway}」。帮我把这句话落到这次的具体安排上——先用 get_events 看看这件事现在是什么样，再给一两条这周就能做的，不要泛泛的建议。`,
    })
    // 一次只推一条。同时甩出三段旧话，那是在翻旧账，不是在帮他开头
    break
  }

  /**
   * R8：他自己写的那条线，和这一阵记下的东西，对不对得上。
   *
   * **主线是他填的，不是算出来的。** 这条规则做的全部事情是把两样东西并排摆出来
   * 数一遍，然后如实报数——判断「哪边该改」是他的事。这一点是整个「记录」阶段的
   * 底线在这条规则上的落法：原计划本来要让系统数出「你真正的主线是 X」，
   * 那是替他下了最要紧的那个判断，已经作废。
   *
   * 让位于 R5/R7：那两条讲的是某一段具体经历，比一条分布上的比照更有抓手。
   * 同屏出现会变成「你这段没记 + 上次那句话 + 你还偏题」，那是审判不是提醒。
   */
  if (!mainlineYields(reminders)) {
    const r = mainlineReminder({ profile, growthEvents, mainlineShownAt })
    if (r) reminders.push(r)
  }

  // R6：长期事项达标但从未用过「招生官读档」
  const admissionsReader = getSkill('admissions-reader')
  if (
    admissionsReader &&
    longEvents.length >= ADMISSIONS_READER_MIN_EVENTS &&
    !usedSkillNames.includes(admissionsReader.manifest.name)
  ) {
    reminders.push({
      key: `suggest-skill:${admissionsReader.manifest.name}`,
      title: `试试「${admissionsReader.manifest.displayName}」`,
      body: admissionsReader.manifest.suggestHint ?? admissionsReader.manifest.description,
      suggestSkillName: admissionsReader.manifest.name,
    })
  }

  return reminders
}

/** R5/R7 同屏时让位。见 R8 那段注释 */
export function mainlineYields(existing: Reminder[]): boolean {
  return existing.some((r) => r.key.startsWith('reflect:') || r.key.startsWith('carryover:'))
}

/**
 * 主线提醒的文案。
 *
 * 排版把结构定死了，不是风格选择：`ReminderStrip` 的 title 包在 `Mono` 里
 * （等宽 = 系统说的话），body 是普通正文。于是——
 *
 * - **title 只放数，一个他的字都不进去。** 主线原话进 title 等于让他自己的句子
 *   以机器声出现，在排版上宣称那条线是 AI 定的，恰好是这个功能最不能出的错
 * - **body 三句，顺序不能换**：他的原话（带「」）→ 口径与对不上的名单 →
 *   一句把裁决权还给他的话。这是从 `ReflectionReader` 那句「原话是你说的，
 *   整理稿是 AI 把它串起来的。两边对不上，以原话为准」照搬来的三段式：
 *   **并排摆两样 / 承认对不上 / 宣布谁说了算**
 *
 * 第三句「哪边该改，你说了算」任何情况下都不能省——**省了这条提醒就成了指控。**
 *
 * 列出具体标题而不是只报一个数，是这条提醒不越权的实质保证：一个光秃秃的计数
 * 只能被接受或被无视，一份名单他能当场指出「模联我勾错类了」然后去改记录。
 * **可被推翻，比任何禁语清单都硬。**
 *
 * ## 明令禁止的句式（改这段代码时对照）
 *
 * 这些在代码里根本不存在，不是靠 prompt 约束——文案模板是本地写死的，模型碰不到。
 *
 * 1. **宣布主线**：「你真正的主线其实是 X」「从你的记录看，你一直在做的是 X」
 *    「你还没设主线，我看你适合设成 X」；任何以「其实／真正／本质上」去命名一条线的句子
 * 2. **判决式动词**：「你偏离了主线」「跑偏」「不够专注」「杂而不精」。
 *    **界面上一个「偏」字都不出现**——内部叫 `drift`，那是变量名不是文案。
 *    也不说「这 3 件和你的主线无关」，「无关」是判断，能说的只有「不在你勾的那几类里」
 * 3. **替他下结论定行动**：「所以你适合走管理方向」「建议把志愿的时间挪到科研上」
 *    「要不要重新设一条主线？」——最后这句最像好意，但它在暗示他设的那条错了
 * 4. **评分与量化包装**：「主线契合度 62%」「专注度 B」——代码里根本不存在比例这个量；
 *    任何对勾／感叹号／红黄绿／进度条
 * 5. **对得上时的表扬**：「你很专注，继续保持」。对得上就完全不出声
 * 6. **催他设主线**：不进 `isProfileEmpty`、不进 R4 的 missing、不做 CTA
 * 7. **把数说成事**：「你最近**做**的事都不在这条线上」——数的是**记下的**，不是做的。
 *    这个词的差别是这条提醒能不能站得住的全部
 * 8. **替他解释**：「可能是因为你最近被社团占了时间」。为什么对不上只有他知道
 */
export function mainlineReminder(input: {
  profile: StudentProfile | null
  growthEvents: GrowthEvent[]
  mainlineShownAt?: number
}): Reminder | null {
  const mainlines = input.profile?.mainlines ?? []
  const drift = mainlineDrift(mainlines, input.growthEvents, input.mainlineShownAt)
  if (!drift) return null

  const listed = drift.off
    .slice(0, MAINLINE_LIST_MAX)
    .map((e) => `「${quoteVerbatim(e.title, MAINLINE_TITLE_MAX)}」`)
    .join('')
  const more = drift.off.length > MAINLINE_LIST_MAX ? '等' : ''

  // noUncheckedIndexedAccess：mainlines[0] 是 MainLine | undefined。
  // 多条主线时不引原话——三句原话拼起来撑破 body，而且逐条念会把
  // 「同时走几条线」说成三重偏离
  const first = mainlines[0]
  const said =
    mainlines.length === 1 && first
      ? `你写的是「${quoteVerbatim(first.text, MAINLINE_QUOTE_MAX)}」`
      : `你写了 ${mainlines.length} 条主线`

  const scope =
    drift.declared
      .slice(0, SCOPE_MAX)
      .map((c) => EVENT_CATEGORY_LABEL[c])
      .join('、') + (drift.declared.length > SCOPE_MAX ? '等' : '')
  const these = drift.declared.length === 1 ? '这一类' : '这几类'

  const body =
    drift.basis === 'marked'
      ? `${said}。这 ${drift.off.length} 件是你自己标了「不在」的：${listed}${more}。哪边该改，你说了算。`
      : `${said}，勾的是${scope}。这 ${drift.off.length} 件不在${these}：${listed}${more}。哪边该改，你说了算。`

  return {
    key: MAINLINE_REMINDER_KEY,
    title: `最近记下的 ${drift.on + drift.off.length} 件长期事项`,
    body,
    // prompt 与 suggestSkillName 都留空，「去处理」因此不渲染。三条理由：
    // ① 带 prompt 就把这条提醒的解释权交回模型，而 BASE 系统提示词正要求
    //    「缺信息时先按合理默认值做出第一版」——那条通用指令在这里的字面意思
    //    就是替他拟一条主线；护栏只有几句中文否定，而否定句还会把
    //    「你的主线其实是什么」原样写进上下文，是抬高而不是压低它的出现概率
    // ② 「去处理」会新开会话，他刚讲完的那段对话就没了
    // ③ 这条提醒没有要处理的东西，说完一句事实就该闭嘴。剩下的只有关闭
  }
}

/**
 * 提醒条里的引文。**必须是原话**，所以这里只做一件事：太长时切短。
 *
 * 切在**句子边界**上，不切在半句里——「我们没有交叉核对的习惯，
 * 但那次其实是来不及」拦腰截断之后意思正好反过来，那就不再是引用了。
 * 首句本身就超长时才硬切，并且都带上省略号，让人知道后面还有。
 * 完整的那句在 prompt 里，点进对话一个字都不少。
 */
function quoteVerbatim(raw: string, max = QUOTE_MAX_CHARS): string {
  const text = raw.trim()
  if (text.length <= max) return text
  const at = text.search(/[。！？!?\n]/)
  const first = at > 0 ? text.slice(0, at + 1) : ''
  return `${first && first.length <= max ? first : text.slice(0, max)}…`
}
