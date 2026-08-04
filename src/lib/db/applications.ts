import { db } from './index'
import { newId } from './repositories'
import type { Application } from '@/types'

/** 申请清单的读写。截止日升序——申请季唯一有意义的排序就是"下一个要交的是哪个"。 */

export async function listApplications(): Promise<Application[]> {
  return db.applications.orderBy('deadline').toArray()
}

export async function addApplication(input: Omit<Application, 'id' | 'createdAt'>): Promise<Application> {
  const application: Application = { ...input, id: newId(), createdAt: Date.now() }
  await db.applications.add(application)
  return application
}

export async function updateApplication(id: string, patch: Partial<Omit<Application, 'id'>>): Promise<void> {
  await db.applications.update(id, patch)
}

/**
 * 删除申请。连带删掉它生成的那条截止事项——留着会变成一条无主的 DDL，
 * 学生在画板上看到它却找不到对应的申请。资产（文书草稿）不删，那是独立语料。
 */
export async function deleteApplication(id: string): Promise<void> {
  await db.transaction('rw', db.applications, db.growthEvents, db.canvasNodes, db.canvasEdges, async () => {
    const application = await db.applications.get(id)
    if (application?.eventId) {
      const nodeId = `event:${application.eventId}`
      await db.canvasEdges.where('sourceNodeId').equals(nodeId).delete()
      await db.canvasEdges.where('targetNodeId').equals(nodeId).delete()
      await db.canvasNodes.delete(nodeId)
      await db.growthEvents.delete(application.eventId)
    }
    await db.applications.delete(id)
  })
}
