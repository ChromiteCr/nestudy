import { dedupeFindingsCapability } from './dedupe'
import { webFetchCapability } from './web'
import type { Capability } from '../types'

/**
 * 调研类能力。
 *
 * **`web_search` 写好了但没有注册。** 不是没做完，是查完之后决定先不上：
 * 要求是「免费、不限量、不用注册账号」，而这样的通用网页搜索**不存在**。
 * 2026-08-25 从服务器（20.214.225.88）逐条实测：
 *
 * | 路线 | 结果 |
 * |---|---|
 * | DuckDuckGo lite（POST + 完整请求头）| **前 2 次 200 拿得到 10 条，第 3 次起一律 202 人机验证**，等 60 秒不恢复 |
 * | Bing / Startpage / Ecosia / Qwant / Yandex | 结果在 JS 里、或工作量证明、或 403 |
 * | 自建 SearXNG | 发的是同样的请求打同样的引擎，**撞的是同一堵墙**，换不掉 |
 * | Marginalia 公共 API | 真的免费不限量，但索引本身不对路：查「MIT 申请截止日」回的是 2012 年的 MIT News 和一个创客空间 wiki，查「Common App 文书题目」回的是第三方作文站而不是官网，中文查询 0 条 |
 * | Brave / Tavily / Serper | 能用，但要注册、按次计费 |
 *
 * 最后一行那种「第三方整理」正是这个产品最该躲开的东西——`school-requirements.json`
 * 的注释里记着：一份第三方整理的名校截止日清单，6 条能核对的有 4 条与官网不符。
 * **搜出一堆这样的东西喂给模型，比不搜更糟。**
 *
 * 服务端那一半（`/v1/web/search` 与 brave/tavily 驱动）留着并且测过，
 * 哪天认了「注册一个免费 key」这件事，填两个环境变量 + 把
 * `webSearchCapability` 加回下面这个数组，就通了。
 *
 * `web_fetch` 照常上：它不要 key、不限量、不用注册，正好是要求里那三条。
 * 没有搜索它也有用——`school-requirements.json` 里每个平台和学校都带着官网地址，
 * 学生自己贴链接也是常事。
 */
export const RESEARCH_READ_CAPABILITIES: Capability[] = [dedupeFindingsCapability, webFetchCapability]

export * from './dedupe'
export * from './web'
