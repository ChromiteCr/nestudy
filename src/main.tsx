import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// 副作用 import：把核心 capability 注册进注册表。放在这里而不是散在各处，
// 是为了让"能力从哪来"只有一个入口。
// 插件的能力**不在这里注册**——它要先读到用户开了哪几个（存在 IndexedDB 里），
// 所以走 `pluginStore.load()`，在 App 的开屏 effect 里。用的仍是同一个
// registerCapability，没有第二条路径。
import '@/lib/capabilities'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
