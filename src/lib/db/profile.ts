import { db } from './index'
import type { StudentProfile } from '@/types'

const PROFILE_ID = 'app'

export async function getProfile(): Promise<StudentProfile> {
  const existing = await db.profile.get(PROFILE_ID)
  // name 为 S2a2 新增字段，旧记录补默认值
  if (existing) return { ...existing, name: existing.name ?? '' }
  const fresh: StudentProfile = {
    id: PROFILE_ID,
    name: '',
    grade: null,
    curriculum: null,
    courses: [],
    targetSchools: [],
  }
  await db.profile.put(fresh)
  return fresh
}

export async function saveProfile(patch: Partial<Omit<StudentProfile, 'id'>>): Promise<StudentProfile> {
  const current = await getProfile()
  const next = { ...current, ...patch }
  await db.profile.put(next)
  return next
}
