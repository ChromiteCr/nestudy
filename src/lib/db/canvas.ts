import { db } from './index'
import { newId } from './repositories'
import type { CanvasEdge, CanvasNode, GraphNodeId } from '@/types'

/**
 * 画板：节点位置/样式的叠加层 + 节点之间的边。
 *
 * 节点行是**可选**的——没有行的节点由画板自动布局，只有被拖动过或带注解的节点才落库。
 * 边可以绑定一个 artifact（反思即边），绑定关系存在边上，解绑不影响资产本身。
 */

export async function listCanvasNodes(): Promise<CanvasNode[]> {
  return db.canvasNodes.toArray()
}

export async function saveCanvasNode(id: GraphNodeId, patch: Partial<Omit<CanvasNode, 'id'>>): Promise<void> {
  const existing = await db.canvasNodes.get(id)
  await db.canvasNodes.put({ x: 0, y: 0, ...existing, ...patch, id })
}

export async function deleteCanvasNode(id: GraphNodeId): Promise<void> {
  await db.canvasNodes.delete(id)
}

export async function listCanvasEdges(): Promise<CanvasEdge[]> {
  return db.canvasEdges.toArray()
}

export async function addCanvasEdge(input: Omit<CanvasEdge, 'id' | 'createdAt'>): Promise<CanvasEdge> {
  const edge: CanvasEdge = { ...input, id: newId(), createdAt: Date.now() }
  await db.canvasEdges.add(edge)
  return edge
}

export async function updateCanvasEdge(id: string, patch: Partial<Omit<CanvasEdge, 'id'>>): Promise<void> {
  await db.canvasEdges.update(id, patch)
}

export async function deleteCanvasEdge(id: string): Promise<void> {
  await db.canvasEdges.delete(id)
}

/** 把一条反思绑到边上；传 undefined 即解绑 */
export async function bindArtifactToEdge(edgeId: string, artifactId: string | undefined): Promise<void> {
  await db.canvasEdges.update(edgeId, { artifactId })
}
