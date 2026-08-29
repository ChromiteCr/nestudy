import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Mono } from '@/components/ui/mono'
import { orderedPlugins, pluginFailure } from '@/plugins/registry'
import { usePluginStore } from '@/stores/pluginStore'
import { cn } from '@/lib/utils'

/**
 * 插件管理。
 *
 * 这一页要回答的是三个问题，**第三个才是这个项目特有的**：
 * 开着没有 · 上不上插件栏 · **它能碰什么**。
 *
 * 第三个不能省。插件是唯一能往能力面里加工具的东西（skill 只能从既有的里挑），
 * 所以「开了这个插件之后，AI 多了哪几件能做的事」必须在开关旁边就看得见，
 * 而不是等它某天调起来才发现。这和商店里「装之前看正文」是同一条规矩。
 */
export function PluginManagerPanel() {
  const prefs = usePluginStore((s) => s.prefs)
  const setEnabled = usePluginStore((s) => s.setEnabled)
  const setOnBar = usePluginStore((s) => s.setOnBar)
  const setOrder = usePluginStore((s) => s.setOrder)
  const [dragging, setDragging] = useState<string | null>(null)

  const plugins = orderedPlugins(prefs)
  const disabled = new Set(prefs.disabled ?? [])
  const offBar = new Set(prefs.offBar ?? [])

  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return
    const ids = plugins.map((p) => p.id).filter((id) => id !== dragging)
    ids.splice(ids.indexOf(targetId), 0, dragging)
    void setOrder(ids)
  }

  if (plugins.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <span className="text-sm font-medium">插件</span>
        {/* 如实说没有，不画一个假的空列表框。S16a 落地时这就是正确状态 */}
        <p className="text-sm text-muted-foreground">
          还没有插件。插件是内置的，随应用更新一起来，不从网上装——
          <strong className="font-medium text-foreground">要给学栖加本事，用技能商店</strong>。
        </p>
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <span className="text-sm font-medium">插件</span>

      <div className="flex flex-col gap-2">
        {plugins.map((p) => {
          const on = !disabled.has(p.id)
          return (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragging(p.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(p.id)}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-3 py-3',
                dragging === p.id && 'opacity-50',
                !on && 'bg-muted/30',
              )}
            >
              <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground" />
              <p.icon className={cn('mt-0.5 size-4 shrink-0', !on && 'text-muted-foreground')} />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{p.name}</span>
                  <Mono className="text-muted-foreground">{p.id}</Mono>
                </div>
                <p className="text-sm text-muted-foreground">{p.summary}</p>

                {/* 注册失败要摆在最显眼的地方。正常永远不出现——出现了就是
                    这个插件的工具一件都没上，而它的界面可能照样能点 */}
                {on && pluginFailure(p.id) && (
                  <p className="text-sm text-destructive">
                    这个插件的能力没能注册，它的工具一件都用不了：
                    <Mono className="ml-1">{pluginFailure(p.id)}</Mono>
                  </p>
                )}

                {/* 它注册了哪几个工具。一个都不注册的插件也说清楚，
                    否则「这一栏空着」会被读成没加载出来 */}
                <p className="text-sm text-muted-foreground">
                  {p.capabilities?.length ? (
                    <>
                      开着的时候 AI 多这几件能做的事：
                      {p.capabilities.map((c) => (
                        <Mono key={c.name} className="ml-1">
                          {c.label}
                        </Mono>
                      ))}
                    </>
                  ) : (
                    '不给 AI 加任何工具，只是一个界面。'
                  )}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox checked={on} onCheckedChange={(v) => void setEnabled(p.id, v === true)} />
                  启用
                </label>
                {/* 纯能力插件没有视图，「上栏」对它无意义，整行不给——
                    给一个点了没反应的勾比不给更糟 */}
                {p.view && (
                  <label className={cn('flex items-center gap-2', !on && 'text-muted-foreground')}>
                    <Checkbox
                      checked={on && !offBar.has(p.id)}
                      disabled={!on}
                      onCheckedChange={(v) => void setOnBar(p.id, v === true)}
                    />
                    在插件栏
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="border-t pt-4 text-sm text-muted-foreground">
        插件随应用更新一起来，
        <strong className="font-medium text-foreground">不从网上装</strong>
        ——浏览器里没有能安全跑别人代码的地方，装进来的代码能读到你本机的全部学习数据。
        想给学栖加本事请用技能商店，技能是纯文本，能碰什么由这里的能力清单说了算。
      </p>
    </div>
  )
}
