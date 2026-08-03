import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// 副作用 import：把核心 capability 注册进注册表。放在这里而不是散在各处，
// 是为了让"能力从哪来"只有一个入口——S13 的 plugin 也接在同一处。
import '@/lib/capabilities'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
