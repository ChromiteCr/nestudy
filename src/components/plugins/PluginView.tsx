import { useEffect } from 'react'
import { getPlugin } from '@/plugins/registry'
import { usePluginEnabled } from '@/stores/pluginStore'

interface PluginViewProps {
  id: string
  /** 这个插件已经不该显示了，把人送回聊天 */
  onLeave: () => void
}

/**
 * 插件视图的挂载点。
 *
 * 这里唯一的实际逻辑是**兜住「脚下的插件没了」**：停在一个插件页上、
 * 又去把它关掉（或它在一次更新里被删掉），画面会停在一块空白上。
 * 照 S15d 的判例处理——那次是老师降级成学生却停在看板上，
 * 做法是把人送回一个一定存在的地方，而不是显示一句像是坏了的错误。
 *
 * 送回去写在 effect 里而不是渲染中直接调：渲染期改父组件的 state 是 React 的
 * 非法操作，会当场警告。
 */
export function PluginView({ id, onLeave }: PluginViewProps) {
  const View = getPlugin(id)?.view
  const enabled = usePluginEnabled(id)
  const gone = !View || !enabled

  useEffect(() => {
    if (gone) onLeave()
  }, [gone, onLeave])

  // 分开写而不是 `if (gone)`：TS 收窄不了经过 boolean 中转的 `View`
  if (!View || !enabled) return null
  return <View />
}
