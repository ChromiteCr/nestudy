import { db } from './index'
import { newId } from './repositories'
import { isoDateOffset, isoToday } from './dates'
import type { GrowthEvent } from '@/types'

/** 统一事项表的读写。短期（任务/DDL/考试）与长期（活动/项目）共用一张表，用 kind 区分。 */

export async function listGrowthEvents(): Promise<GrowthEvent[]> {
  return db.growthEvents.orderBy('startDate').toArray()
}

export async function listShortEvents(): Promise<GrowthEvent[]> {
  return db.growthEvents.where('kind').equals('short').sortBy('startDate')
}

/** 长期事项：进行中的排前，其余按开始日期倒序 */
export async function listLongEvents(): Promise<GrowthEvent[]> {
  const events = await db.growthEvents.where('kind').equals('long').toArray()
  return events.sort((a, b) => {
    if (!a.endDate && b.endDate) return -1
    if (a.endDate && !b.endDate) return 1
    return b.startDate.localeCompare(a.startDate)
  })
}

/** 今天起 N 天内的短期事项，按日期升序 */
export async function listUpcomingShortEvents(days = 60): Promise<GrowthEvent[]> {
  const today = isoToday()
  const end = isoDateOffset(days)
  const events = await db.growthEvents.where('startDate').between(today, end, true, true).sortBy('startDate')
  return events.filter((e) => e.kind === 'short')
}

/** 今日待办（含逾期未完成的任务） */
export async function listDueShortEvents(): Promise<GrowthEvent[]> {
  const today = isoToday()
  const events = await db.growthEvents.where('startDate').belowOrEqual(today).sortBy('startDate')
  return events.filter((e) => e.kind === 'short' && e.status === 'pending')
}

export async function addGrowthEvent(input: Omit<GrowthEvent, 'id' | 'createdAt'>): Promise<GrowthEvent> {
  const event: GrowthEvent = { ...input, id: newId(), createdAt: Date.now() }
  await db.growthEvents.add(event)
  return event
}

export async function updateGrowthEvent(id: string, patch: Partial<Omit<GrowthEvent, 'id'>>): Promise<void> {
  await db.growthEvents.update(id, patch)
}

/**
 * 删除事项。连带清理：挂靠的子事项解除挂靠、画板上指向它的边、资产里对它的节点引用。
 * 资产本身不删——反思是独立的长期语料，不因为关联事项被删就消失。
 */
export async function deleteGrowthEvent(id: string): Promise<void> {
  await db.transaction('rw', db.growthEvents, db.canvasEdges, db.canvasNodes, db.artifacts, async () => {
    const nodeId = `event:${id}`
    await db.growthEvents.where('parentId').equals(id).modify({ parentId: undefined })
    await db.canvasEdges.where('sourceNodeId').equals(nodeId).delete()
    await db.canvasEdges.where('targetNodeId').equals(nodeId).delete()
    await db.canvasNodes.delete(nodeId)
    const linked = await db.artifacts.filter((a) => a.linkedNodeIds.includes(nodeId)).toArray()
    await Promise.all(
      linked.map((a) =>
        db.artifacts.update(a.id, { linkedNodeIds: a.linkedNodeIds.filter((n) => n !== nodeId) }),
      ),
    )
    await db.growthEvents.delete(id)
  })
}
