import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { usePlanningStore } from '@/stores/planningStore'
import { newId } from '@/lib/db/repositories'
import type { Course, Curriculum, TargetSchool } from '@/types'

interface ProfileFormProps {
  onSaved?: () => void
}

/** 档案编辑表单（设置中心「档案」分类使用；对话式建档的兜底与补充） */
export function ProfileForm({ onSaved }: ProfileFormProps) {
  const profile = usePlanningStore((s) => s.profile)
  const updateProfile = usePlanningStore((s) => s.updateProfile)

  const [name, setName] = useState('')
  const [grade, setGrade] = useState<string>('none')
  const [curriculum, setCurriculum] = useState<string>('none')
  const [courses, setCourses] = useState<Course[]>([])
  const [schools, setSchools] = useState<TargetSchool[]>([])

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setGrade(profile.grade?.toString() ?? 'none')
      setCurriculum(profile.curriculum ?? 'none')
      setCourses(profile.courses)
      setSchools(profile.targetSchools)
    }
  }, [profile])

  const save = async () => {
    await updateProfile({
      name: name.trim(),
      grade: grade === 'none' ? null : Number(grade),
      curriculum: curriculum === 'none' ? null : (curriculum as Curriculum),
      courses: courses.filter((c) => c.name.trim()),
      targetSchools: schools.filter((s) => s.name.trim()),
    })
    onSaved?.()
  }

  const patchCourse = (i: number, patch: Partial<Course>) =>
    setCourses((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const patchSchool = (i: number, patch: Partial<TargetSchool>) =>
    setSchools((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <p className="text-sm text-muted-foreground">也可以在对话里让学栖采访你来补全档案。</p>

      <TextField label="名字 / 昵称" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">年级</span>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="h-13 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未设置</SelectItem>
              {[9, 10, 11, 12].map((g) => (
                <SelectItem key={g} value={String(g)}>
                  {g} 年级
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">课程体系</span>
          <Select value={curriculum} onValueChange={setCurriculum}>
            <SelectTrigger className="h-13 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未设置</SelectItem>
              <SelectItem value="IB">IB</SelectItem>
              <SelectItem value="AP">AP</SelectItem>
              <SelectItem value="ALevel">A-Level</SelectItem>
              <SelectItem value="Other">其他</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">课程</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              setCourses((p) => [...p, { id: newId(), name: '', level: '', currentGrade: '', targetGrade: '' }])
            }
          >
            <Plus className="size-3" />
            添加课程
          </Button>
        </div>
        {courses.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <TextField label="课程名" size="sm" wrapClassName="flex-1" value={c.name} onChange={(e) => patchCourse(i, { name: e.target.value })} />
            <TextField label="等级" size="sm" wrapClassName="w-20" value={c.level} onChange={(e) => patchCourse(i, { level: e.target.value })} />
            <TextField label="当前" size="sm" wrapClassName="w-16" value={c.currentGrade} onChange={(e) => patchCourse(i, { currentGrade: e.target.value })} />
            <TextField label="目标" size="sm" wrapClassName="w-16" value={c.targetGrade} onChange={(e) => patchCourse(i, { targetGrade: e.target.value })} />
            <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="删除课程" onClick={() => setCourses((p) => p.filter((_, idx) => idx !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">目标学校</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              setSchools((p) => [...p, { id: newId(), name: '', major: '', round: 'Other', deadline: null }])
            }
          >
            <Plus className="size-3" />
            添加学校
          </Button>
        </div>
        {schools.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <TextField label="学校" size="sm" wrapClassName="flex-1" value={s.name} onChange={(e) => patchSchool(i, { name: e.target.value })} />
            <TextField label="专业" size="sm" wrapClassName="w-24" value={s.major} onChange={(e) => patchSchool(i, { major: e.target.value })} />
            <Select value={s.round} onValueChange={(v) => patchSchool(i, { round: v as TargetSchool['round'] })}>
              <SelectTrigger className="h-11 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ED">ED</SelectItem>
                <SelectItem value="EA">EA</SelectItem>
                <SelectItem value="RD">RD</SelectItem>
                <SelectItem value="Other">其他</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="删除学校" onClick={() => setSchools((p) => p.filter((_, idx) => idx !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button onClick={() => void save()}>保存档案</Button>
    </div>
  )
}
