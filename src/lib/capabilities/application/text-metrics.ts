/**
 * 字符与词数的计数口径。
 *
 * 这几个函数是 S9 那条判据的样板：**LLM 数不准字符数**，尤其中英混排。
 * 但"数不准"还有更细的一层——学生自己也数不准，因为**表单的口径和肉眼的口径不一样**：
 *
 * HTML 的 maxlength 按 UTF-16 code unit 计（规范里叫 code-unit length）。
 * BMP 之外的字符（绝大多数 emoji）在 JS 里 `.length` 就是 2，表单也按 2 扣。
 * 所以学生数出来 148 个字、Common App 却说超了，多半就是几个 emoji 各吃了 2 格。
 * 两个口径都报出来，差在哪一眼能看见。
 */

/** 表单实际扣的格数：UTF-16 code unit，与 HTML maxlength 同口径 */
export function formCharCount(text: string): number {
  return text.length
}

let segmenter: Intl.Segmenter | null | undefined

/** 肉眼看到的字符数：按字素簇算，emoji（含 ZWJ 组合、肤色）记 1 个 */
export function visualCharCount(text: string): number {
  if (segmenter === undefined) {
    segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null
  }
  if (segmenter) {
    let n = 0
    for (const _ of segmenter.segment(text)) n++
    return n
  }
  // 没有 Segmenter 就退到 code point：ZWJ 组合会多算，但比 .length 接近
  return [...text].length
}

/** CJK 与日韩：这些字之间不靠空格分词，逐字计 */
const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/gu

/**
 * 词数。英文按空白切分，只认含字母或数字的片段（"—" 之类不算词）；
 * 中日韩逐字计——这是 Word 和多数计数器的做法，也是中文草稿唯一说得通的口径。
 */
export function wordCount(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0
  const rest = text.replace(CJK, ' ')
  const latin = rest.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  return cjk + latin
}

/** 段落数：连续空行分段，忽略纯空白段 */
export function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/).filter((p) => p.trim() !== '').length
}

export interface FieldCheck {
  field: string
  limit: number
  /** 表单口径（UTF-16） */
  used: number
  /** 肉眼口径（字素簇） */
  visible: number
  remaining: number
  over: boolean
  /** used 与 visible 不等时说明差在哪 */
  note?: string
}

export function checkField(field: string, rawValue: string, limit: number): FieldCheck {
  // 表单一般会吃掉首尾空白，先按 trim 后的算，免得因为一个尾随空格误判超限
  const value = rawValue.trim()
  const used = formCharCount(value)
  const visible = visualCharCount(value)
  return {
    field,
    limit,
    used,
    visible,
    remaining: limit - used,
    over: used > limit,
    note:
      used === visible
        ? undefined
        : `肉眼 ${visible} 个字符，表单按 ${used} 格计（emoji 等字符在表单里占 2 格）`,
  }
}
