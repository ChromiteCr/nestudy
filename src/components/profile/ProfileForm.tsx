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
import { useReminderStore } from '@/stores/reminderStore'
import { unmatchedCategories } from '@/lib/engine/mainline'
import {
  ACTIVITY_CATEGORY_LABEL,
  MAINLINE_CATEGORIES,
  type Course,
  type Curriculum,
  type MainLine,
  type MainlineCategory,
  type TargetSchool,
} from '@/types'

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
  const [mainlines, setMainlines] = useState<MainLine[]>([])
  const growthEvents = usePlanningStore((s) => s.growthEvents)

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setGrade(profile.grade?.toString() ?? 'none')
      setCurriculum(profile.curriculum ?? 'none')
      setCourses(profile.courses)
      setSchools(profile.targetSchools)
      setMainlines(profile.mainlines ?? [])
    }
  }, [profile])

  const save = async () => {
    await updateProfile({
      name: name.trim(),
      grade: grade === 'none' ? null : Number(grade),
      curriculum: curriculum === 'none' ? null : (curriculum as Curriculum),
      courses: courses.filter((c) => c.name.trim()),
      targetSchools: schools.filter((s) => s.name.trim()),
      // **只过滤空文本。** 不加 `&& m.categories.length > 0`：
      // 一条写了字却没勾类别的主线是合法的（= 这条线不参与比照），
      // 因为没勾就把他写下的那句话整条丢掉，是拿「先把自己归类」
      // 换「你的话才配被保存」
      mainlines: mainlines.filter((m) => m.text.trim()),
    })
    // 主线一改，比照口径就变了，让提醒条当场跟上。设置页里聊天视图没挂载，
    // 不存在打断问题
    void useReminderStore.getState().refreshMainline()
    onSaved?.()
  }

  const patchCourse = (i: number, patch: Partial<Course>) =>
    setCourses((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const patchSchool = (i: number, patch: Partial<TargetSchool>) =>
    setSchools((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const patchMainline = (i: number, patch: Partial<MainLine>) =>
    setMainlines((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const toggleCategory = (i: number, c: MainlineCategory) =>
    setMainlines((prev) =>
      prev.map((m, idx) =>
        idx === i
          ? {
              ...m,
              categories: m.categories.includes(c)
                ? m.categories.filter((x) => x !== c)
                : [...m.categories, c],
            }
          : m,
      ),
    )

  // 他勾了、却在已记的长期事项里一条都没对上的类别。这是「口径对不对得上」，
  // 不是「他偏没偏」——所以它只出现在他自己来看档案的时候，不进提醒条。
  // 它同时是那道锚定闸对学生可见的解释，否则那道闸就是个黑箱
  const unmatched = unmatchedCategories(mainlines.filter((m) => m.text.trim()), growthEvents)

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

      <Separator />

      {/*
        主线摆在最后：前四组填的是事实（名字、年级、课程、学校），这一组填的是判断，
        判断放在事实后面。它也正好落在设置页那两段边界说明（不替你写／不上传云端）正上方，
        读下来是「这条线是你自己定的」紧接着「下面写着我不替你做什么」
      */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">你的主线</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setMainlines((p) => [...p, { id: newId(), text: '', categories: [], createdAt: Date.now() }])}
          >
            <Plus className="size-3" />
            写一条
          </Button>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <strong className="font-medium text-foreground">这条线是你自己写的，学栖不替你猜。</strong>
          </p>
          <p>
            勾几类是给提醒用的口径：只有勾了，它才知道拿哪几类跟你记下的东西对一对。
            一类都不勾，就只是存一句话，不比照任何东西。
          </p>
          <p>设了之后，你记完东西时它会如实说哪几件对不上；对得上就不出声。不设就整个不提。</p>
        </div>

        {mainlines.map((m, i) => (
          <div key={m.id} className="flex flex-col gap-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <TextField
                label="你这几年在做的那条线"
                size="sm"
                wrapClassName="flex-1"
                value={m.text}
                onChange={(e) => patchMainline(i, { text: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="删除主线"
                onClick={() => setMainlines((p) => p.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {MAINLINE_CATEGORIES.map((c) => (
                <Button
                  key={c}
                  variant={m.categories.includes(c) ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => toggleCategory(i, c)}
                >
                  {ACTIVITY_CATEGORY_LABEL[c]}
                </Button>
              ))}
            </div>
          </div>
        ))}

        {unmatched.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            你勾的「{unmatched.map((c) => ACTIVITY_CATEGORY_LABEL[c]).join('」「')}
            」在已记的长期事项里还没有一条对上。可能是这一类还没记，也可能是记录里的分类和你勾的不一样。
          </p>
        )}
      </div>

      <Button onClick={() => void save()}>保存档案</Button>
    </div>
  )
}
