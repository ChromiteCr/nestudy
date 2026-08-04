import type { Capability } from '../types'

/**
 * 成绩换算。
 *
 * 这里要分清两件性质完全不同的事，混着说就是在制造错误答案：
 *
 * 1. **确定性映射**——IB 总分构成、UCAS Tariff 分值、字母成绩折 4.0 GPA。
 *    有明文规则，算错就是算错，正该由代码来算。
 * 2. **跨体系的"大致相当"**——IB 7 分相当于美高的 A 还是 A+，没有权威口径，
 *    各校 profile 各写各的。这类只能标成**参考惯例**给出，不能当成事实。
 *
 * 还有一件必须挡住的：**AP 考试分数（1–5）不是课程成绩，不能折 GPA。**
 * 招生官分开看这两样，把 5 分当成 A 塞进 GPA 是纯粹的错。
 */

const UCAS_TARIFF: Record<string, Record<string, number>> = {
  'a-level': { 'A*': 56, A: 48, B: 40, C: 32, D: 24, E: 16 },
  as: { A: 20, B: 16, C: 12, D: 10, E: 6 },
  epq: { 'A*': 28, A: 24, B: 20, C: 16, D: 12, E: 6 },
}

const LETTER_TO_GPA: Record<string, number> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  F: 0,
}

/** 参考惯例，**不是官方口径**——各校 school profile 的写法差异很大 */
const IB_TO_LETTER: Record<number, string> = {
  7: 'A / A+',
  6: 'A- / B+',
  5: 'B',
  4: 'C+ / C',
  3: 'C- / D+',
  2: 'D',
  1: 'F',
}

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs?.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function normalizeLetter(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace('＊', '*')
}

interface RawSubject {
  name?: unknown
  grade?: unknown
  type?: unknown
  credits?: unknown
  weight?: unknown
}

function asArray(value: unknown): RawSubject[] {
  return Array.isArray(value) ? (value as RawSubject[]) : []
}

export const convertGradesCapability: Capability = {
  name: 'convert_grades',
  kind: 'read',
  label: '换算成绩',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const parts: string[] = []
    if (args.ib) parts.push('IB 总分')
    if (args.alevel) parts.push('UCAS 分值')
    if (args.gpa) parts.push('GPA')
    return parts.length > 0 ? `换算${parts.join(' / ')}` : undefined
  },
  summary: '算 IB 总分、A-Level 的 UCAS Tariff 分值、字母成绩折 4.0 GPA',
  owner: 'core',
  schema: {
    name: 'convert_grades',
    description:
      '成绩换算：IB 各科分数汇总成总分（含 TOK/EE 加分，满分 45）、A-Level 字母换 UCAS Tariff 分值、字母成绩折 4.0 制 GPA。**别口算这些，一律调工具**。三组参数都是可选的，给哪组算哪组。注意：AP 考试分数（1–5）是考试成绩不是课程成绩，不能折 GPA，工具会拒绝这么做。跨体系的"大致相当"只作为参考惯例返回，转述时必须说明它不是官方口径。',
    parameters: {
      type: 'object',
      properties: {
        ib: {
          type: 'object',
          description: 'IB 成绩汇总',
          properties: {
            subjects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  grade: { type: 'number', description: '1–7' },
                  type: { type: 'string', enum: ['HL', 'SL'] },
                },
                required: ['grade'],
              },
            },
            coreBonus: { type: 'number', description: 'TOK + EE 加分，0–3' },
          },
          required: ['subjects'],
        },
        alevel: {
          type: 'object',
          description: 'A-Level / AS / EPQ 换 UCAS Tariff 分值',
          properties: {
            subjects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  grade: { type: 'string', description: 'A*、A、B、C、D、E' },
                  type: { type: 'string', enum: ['a-level', 'as', 'epq'], description: '默认 a-level' },
                },
                required: ['grade'],
              },
            },
          },
          required: ['subjects'],
        },
        gpa: {
          type: 'object',
          description: '字母成绩折 4.0 制',
          properties: {
            courses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  grade: { type: 'string', description: 'A+ / A / A- / B+ … / F' },
                  credits: { type: 'number', description: '学分权重，默认 1' },
                  weight: { type: 'number', description: '加权分（AP/HL 常见 +1，Honors +0.5），默认 0' },
                },
                required: ['grade'],
              },
            },
          },
          required: ['courses'],
        },
        apExamScores: {
          type: 'array',
          description: 'AP 考试分数，只做汇总不折 GPA',
          items: {
            type: 'object',
            properties: { subject: { type: 'string' }, score: { type: 'number', description: '1–5' } },
            required: ['score'],
          },
        },
      },
      required: [],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const out: Record<string, unknown> = {}
    const notes: string[] = []

    // ---- IB 总分：明文规则，6 科各 7 分 + 核心 3 分 = 45 ----
    if (args.ib && typeof args.ib === 'object') {
      const ib = args.ib as { subjects?: unknown; coreBonus?: unknown }
      const subjects = asArray(ib.subjects)
        .map((s) => ({
          name: String(s.name ?? '').trim() || '（未命名）',
          level: normalizeLetter(s.type) === 'SL' ? 'SL' : normalizeLetter(s.type) === 'HL' ? 'HL' : undefined,
          grade: typeof s.grade === 'number' ? Math.round(s.grade) : null,
        }))
        .filter((s) => s.grade !== null && s.grade >= 1 && s.grade <= 7)
      const subjectTotal = subjects.reduce((sum, s) => sum + (s.grade ?? 0), 0)
      const coreBonus = typeof ib.coreBonus === 'number' ? Math.min(3, Math.max(0, Math.round(ib.coreBonus))) : 0
      const total = subjectTotal + coreBonus
      const warnings: string[] = []
      if (subjects.length !== 6) warnings.push(`只给了 ${subjects.length} 科，IB 文凭按 6 科计，总分会偏低`)

      out.ib = {
        subjects: subjects.map((s) => ({ ...s, referenceLetter: IB_TO_LETTER[s.grade as number] })),
        subjectTotal,
        coreBonus,
        total,
        max: 45,
        passThreshold: 24,
        meetsPointThreshold: total >= 24,
        warnings,
        note: '24 分只是分数线，拿文凭还有其他细则（TOK/EE 不得为 E、HL 不得有 1 分等），这里没算',
      }
      notes.push('IB 各科对应的美高字母成绩是参考惯例，不是官方换算，转述时要说明')
    }

    // ---- UCAS Tariff：官方分值表，算术而已 ----
    if (args.alevel && typeof args.alevel === 'object') {
      const al = args.alevel as { subjects?: unknown }
      const rows = asArray(al.subjects).map((s) => {
        const type = String(s.type ?? 'a-level').toLowerCase()
        const table = UCAS_TARIFF[type] ?? UCAS_TARIFF['a-level']
        const grade = normalizeLetter(s.grade)
        const points = table[grade]
        return {
          name: String(s.name ?? '').trim() || '（未命名）',
          type: UCAS_TARIFF[type] ? type : 'a-level',
          grade,
          points: points ?? null,
          error: points === undefined ? `认不出成绩「${String(s.grade ?? '')}」` : undefined,
        }
      })
      // 认不出的成绩按 0 计入总分会算出一个看着正常的错数，必须单列出来
      const unrecognized = rows.filter((r) => r.points === null)
      out.alevel = {
        subjects: rows,
        totalPoints: rows.reduce((sum, r) => sum + (r.points ?? 0), 0),
        countedSubjects: rows.length - unrecognized.length,
        unrecognized: unrecognized.map((r) => r.name),
        tariffTable: UCAS_TARIFF,
        note: 'UCAS Tariff 是官方分值表（2017 起沿用）。但多数英国大学发的是成绩条件（如 A*AA）而不是 Tariff 分，别把两者混为一谈',
      }
    }

    // ---- 4.0 GPA：折算表是美国通行惯例，学校间仍有出入 ----
    if (args.gpa && typeof args.gpa === 'object') {
      const g = args.gpa as { courses?: unknown }
      const rows = asArray(g.courses).map((c) => {
        const grade = normalizeLetter(c.grade)
        const base = LETTER_TO_GPA[grade]
        const credits = typeof c.credits === 'number' && c.credits > 0 ? c.credits : 1
        const weight = typeof c.weight === 'number' ? c.weight : 0
        return {
          name: String(c.name ?? '').trim() || '（未命名）',
          grade,
          credits,
          weight,
          points: base === undefined ? null : base,
          weightedPoints: base === undefined ? null : base + weight,
          error: base === undefined ? `认不出成绩「${String(c.grade ?? '')}」` : undefined,
        }
      })
      const valid = rows.filter((r) => r.points !== null)
      const credits = valid.reduce((sum, r) => sum + r.credits, 0)
      const round2 = (n: number) => Math.round(n * 100) / 100
      out.gpa = {
        courses: rows,
        // 认不出的课直接不进分母，但要说出来是哪几门被排除了
        unrecognized: rows.filter((r) => r.points === null).map((r) => r.name),
        countedCourses: valid.length,
        totalCredits: credits,
        unweighted: credits > 0 ? round2(valid.reduce((s, r) => s + (r.points ?? 0) * r.credits, 0) / credits) : null,
        weighted: credits > 0 ? round2(valid.reduce((s, r) => s + (r.weightedPoints ?? 0) * r.credits, 0) / credits) : null,
        scale: LETTER_TO_GPA,
        note: '折算表是美国通行惯例；部分学校 A+ 记 4.3、加权规则也各不相同。学校出的官方成绩单永远优先于这里算出来的数',
      }
    }

    // ---- AP 考试分数：明确拒绝折 GPA ----
    if (Array.isArray(args.apExamScores)) {
      const scores = (args.apExamScores as { subject?: unknown; score?: unknown }[])
        .map((s) => ({
          subject: String(s.subject ?? '').trim() || '（未命名）',
          score: typeof s.score === 'number' ? Math.round(s.score) : null,
        }))
        .filter((s) => s.score !== null && s.score >= 1 && s.score <= 5)
      out.apExamScores = {
        scores,
        count: scores.length,
        fourOrAbove: scores.filter((s) => (s.score ?? 0) >= 4).length,
        refusedConversion:
          'AP 考试分数（1–5）是标化考试成绩，不是课程成绩，不能折算成 GPA。招生官分开看这两样：GPA 来自成绩单上的课程字母成绩，AP 分数单独列在标化那一栏。',
      }
    }

    if (Object.keys(out).length === 0) {
      return JSON.stringify({ error: 'ib / alevel / gpa / apExamScores 至少要给一组' })
    }
    return JSON.stringify({ ...out, notes })
  },
}
