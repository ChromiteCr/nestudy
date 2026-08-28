import { db } from './index'
import { newId } from './repositories'
import type { Artifact, ArtifactKind, GraphNodeId, ReflectionQA } from '@/types'

/** 学习资产：反思、文档、计划、评审等 skill 产物的统一落点 */

export async function listArtifacts(): Promise<Artifact[]> {
  return db.artifacts.orderBy('createdAt').reverse().toArray()
}

export async function listArtifactsByKind(kind: ArtifactKind): Promise<Artifact[]> {
  const artifacts = await db.artifacts.where('kind').equals(kind).toArray()
  return artifacts.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addArtifact(input: Omit<Artifact, 'id' | 'createdAt'>): Promise<Artifact> {
  const artifact: Artifact = { ...input, id: newId(), createdAt: Date.now() }
  await db.artifacts.add(artifact)
  return artifact
}

/**
 * **在原有记录上追加。** 一段经历不是一次讲完的。
 *
 * 硬边界，也是这个函数存在的全部理由：**`qa` 只增，不删不改。**
 * 底稿一旦可以被后来的调用改写，它就不再是底稿——`ReflectionReader` 上那句
 * 「两边对不上，以原话为准」也就成了空话。所以已有的问答对象在这里
 * 只被原样展开，新来的接在后面；字面完全重复的一对会被丢掉，
 * 这样即使模型误把原文整份重发也不会把记录撑成两倍。
 *
 * 其余几项的取舍：
 *
 * - **正文是接上去的，不是替换的。** 正文虽是整理稿、改写它不动原话，
 *   但学生按「保存」时看到的是那一版；让后来的调用悄悄重写他已经认过的文字，
 *   和替他总结成长感悟是同一类越界。所以传进来的 `content` 只是**新增的那一段**
 * - **`takeaway` 只增不清。** 传空表示这次不动它——他上次说的那句「下次会怎么做」
 *   不该因为一次补记就消失
 * - **标签与画板连线取并集。** 两者都是「这份记录和什么有关」，追加只会让关系更多
 *
 * 找不到原记录返回 null（模型可能给了个不存在的 id）——由调用方如实报出来，
 * **不能退化成新建一条**：那会把「补充」变成「又写了一份」，正是这一项要修的毛病。
 */
export async function appendToArtifact(
  id: string,
  input: {
    /** 只写新增的那一段，不要重复原文。空串表示这次不动正文 */
    content: string
    qa?: ReflectionQA[]
    takeaway?: string
    tags?: string[]
    linkedNodeIds?: GraphNodeId[]
  },
): Promise<Artifact | null> {
  return db.transaction('rw', db.artifacts, async () => {
    const existing = await db.artifacts.get(id)
    if (!existing) return null

    const seen = new Set((existing.qa ?? []).map((p) => `${p.question}\u0000${p.answer}`))
    const added = (input.qa ?? []).filter((p) => !seen.has(`${p.question}\u0000${p.answer}`))
    const qa = [...(existing.qa ?? []), ...added]

    const addition = input.content.trim()
    const at = Date.now()
    const next: Artifact = {
      ...existing,
      content: addition ? `${existing.content}\n\n${addition}` : existing.content,
      qa: qa.length > 0 ? qa : undefined,
      takeaway: input.takeaway?.trim() || existing.takeaway,
      tags: [...new Set([...existing.tags, ...(input.tags ?? [])])],
      linkedNodeIds: [...new Set([...existing.linkedNodeIds, ...(input.linkedNodeIds ?? [])])],
      updatedAt: at,
      revisions: [...(existing.revisions ?? []), { at, addedQa: added.length }],
    }
    await db.artifacts.put(next)
    return next
  })
}

export async function updateArtifact(id: string, patch: Partial<Omit<Artifact, 'id'>>): Promise<void> {
  await db.artifacts.update(id, patch)
}

/** 删除资产时解除画板上边对它的绑定，但保留边本身（边表达关系，资产是关系的内容） */
export async function deleteArtifact(id: string): Promise<void> {
  await db.transaction('rw', db.artifacts, db.canvasEdges, async () => {
    await db.canvasEdges.where('artifactId').equals(id).modify({ artifactId: undefined })
    await db.artifacts.delete(id)
  })
}
