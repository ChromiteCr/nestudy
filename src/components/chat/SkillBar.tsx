import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSkillStore } from '@/stores/skillStore'
import { listSkills } from '@/lib/skills/registry'

/** 聊天页顶部的 skill 入口：未激活时是选择菜单，激活后是状态条 + 退出 */
export function SkillBar() {
  const activeSkillId = useSkillStore((s) => s.activeSkillId)
  const setActiveSkill = useSkillStore((s) => s.setActiveSkill)
  const skills = listSkills()
  const active = skills.find((s) => s.id === activeSkillId)

  if (active) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            当前 Skill：<span className="font-medium">{active.name}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            onClick={() => setActiveSkill(null)}
          >
            <X className="size-3" />
            退出
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl justify-end px-4 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <Sparkles className="size-3.5" />
            使用 Skill
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {skills.map((s) => (
            <DropdownMenuItem key={s.id} className="flex-col items-start gap-0.5" onClick={() => setActiveSkill(s.id)}>
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
