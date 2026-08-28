import { db } from './index'
import type { StudentProfile } from '@/types'

const PROFILE_ID = 'app'

export async function getProfile(): Promise<StudentProfile> {
  const existing = await db.profile.get(PROFILE_ID)
  // name 为 S2a2 新增、mainlines 为 S15b 新增，旧记录在这里补默认值。
  // 补在读取口而不是各调用点：tsconfig 开了 noUncheckedIndexedAccess，
  // 靠每处写 `?? []` 迟早漏一个
  if (existing) return { ...existing, name: existing.name ?? '', mainlines: existing.mainlines ?? [] }
  const fresh: StudentProfile = {
    id: PROFILE_ID,
    name: '',
    grade: null,
    curriculum: null,
    courses: [],
    targetSchools: [],
    mainlines: [],
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
