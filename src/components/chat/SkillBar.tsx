import { Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Mono } from '@/components/ui/mono'
import { useSkillStore } from '@/stores/skillStore'
import { getSkill, listSkills, OUTPUT_LABEL } from '@/lib/skills'
import { resolveForSkill } from '@/lib/capabilities'

/** 聊天页顶部的 skill 入口：未激活时是选择菜单，激活后是状态条 + 退出 */
export function SkillBar() {
  const activeSkillName = useSkillStore((s) => s.activeSkillName)
  const setActiveSkill = useSkillStore((s) => s.setActiveSkill)
  const skills = listSkills()
  const active = activeSkillName ? getSkill(activeSkillName) : undefined

  if (skills.length === 0) return null

  if (active) {
    const { granted } = resolveForSkill(active.manifest)
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-accent/40 px-3 py-1.5">
          <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">{active.manifest.displayName}</span>
          <Mono className="text-muted-foreground">v{active.manifest.version}</Mono>
          {/* 把 skill 能碰什么摊开写：授权范围看不见，白名单就只是我们自己知道的事 */}
          <Mono className="text-muted-foreground">
            {active.manifest.readOnly ? '只读' : `${granted.length} 项能力`} ·{' '}
            {active.manifest.outputs.map((o) => OUTPUT_LABEL[o]).join('/')}
          </Mono>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-1.5 text-muted-foreground"
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
          <Button variant="outline" size="sm" className="h-7 gap-1.5">
            <Sparkles className="size-3.5" />
            使用 Skill
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          {skills.map((s) => (
            <DropdownMenuItem
              key={s.manifest.name}
              className="flex-col items-start gap-1"
              onClick={() => setActiveSkill(s.manifest.name)}
            >
              <div className="flex w-full items-center gap-1.5">
                <span className="font-medium">{s.manifest.displayName}</span>
                <Badge variant="outline" className="ml-auto shrink-0">
                  <Mono>{s.manifest.readOnly ? '只读' : '可提案'}</Mono>
                </Badge>
              </div>
              <span className="text-sm whitespace-normal text-muted-foreground">{s.manifest.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
