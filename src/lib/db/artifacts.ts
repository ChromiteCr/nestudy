import { db } from './index'
import { newId } from './repositories'
import type { Artifact, ArtifactKind } from '@/types'

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
