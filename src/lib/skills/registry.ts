import type { SkillDefinition } from './types'
import admissionsReader from './defs/admissions-reader.json'

const SKILLS: SkillDefinition[] = [admissionsReader as SkillDefinition]

export function listSkills(): SkillDefinition[] {
  return SKILLS
}

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.id === id)
}
