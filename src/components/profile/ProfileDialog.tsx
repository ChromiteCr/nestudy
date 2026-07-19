import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 档案手动编辑表单（对话式建档的兜底与补充） */
export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const profile = usePlanningStore((s) => s.profile)
  const updateProfile = usePlanningStore((s) => s.updateProfile)

  const [grade, setGrade] = useState<string>('none')
  const [curriculum, setCurriculum] = useState<string>('none')
  const [courses, setCourses] = useState<Course[]>([])
  const [schools, setSchools] = useState<TargetSchool[]>([])

  // 打开时从 store 同步草稿
  useEffect(() => {
    if (open && profile) {
      setGrade(profile.grade?.toString() ?? 'none')
      setCurriculum(profile.curriculum ?? 'none')
      setCourses(profile.courses)
      setSchools(profile.targetSchools)
    }
  }, [open, profile])

  const save = async () => {
    await updateProfile({
      grade: grade === 'none' ? null : Number(grade),
      curriculum: curriculum === 'none' ? null : (curriculum as Curriculum),
      courses: courses.filter((c) => c.name.trim()),
      targetSchools: schools.filter((s) => s.name.trim()),
    })
    toast.success('档案已保存')
    onOpenChange(false)
  }

  const patchCourse = (i: number, patch: Partial<Course>) =>
    setCourses((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const patchSchool = (i: number, patch: Partial<TargetSchool>) =>
    setSchools((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>学生档案</DialogTitle>
          <DialogDescription>也可以在对话里让学栖采访你来补全档案。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">年级</span>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger>
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
                <SelectTrigger>
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
                <Input placeholder="课程名" value={c.name} onChange={(e) => patchCourse(i, { name: e.target.value })} className="h-8 flex-1" />
                <Input placeholder="等级" value={c.level} onChange={(e) => patchCourse(i, { level: e.target.value })} className="h-8 w-20" />
                <Input placeholder="当前" value={c.currentGrade} onChange={(e) => patchCourse(i, { currentGrade: e.target.value })} className="h-8 w-16" />
                <Input placeholder="目标" value={c.targetGrade} onChange={(e) => patchCourse(i, { targetGrade: e.target.value })} className="h-8 w-16" />
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
                <Input placeholder="学校" value={s.name} onChange={(e) => patchSchool(i, { name: e.target.value })} className="h-8 flex-1" />
                <Input placeholder="专业" value={s.major} onChange={(e) => patchSchool(i, { major: e.target.value })} className="h-8 w-24" />
                <Select value={s.round} onValueChange={(v) => patchSchool(i, { round: v as TargetSchool['round'] })}>
                  <SelectTrigger className="h-8 w-20" size="sm">
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
      </DialogContent>
    </Dialog>
  )
}
