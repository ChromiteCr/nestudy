import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 自定义域根路径部署（public/CNAME → app.nestudy.cn）。
  // 若日后退回 <user>.github.io/nestudy/ 子路径，改回 '/nestudy/' 并删掉 public/CNAME。
  base: '/',
  server: {
    /**
     * 开发时把 `/api` 转到本机跑的 relay，**让线上和开发走同一条代码路径**——
     * 客户端里只有 `/api` 这一种写法，不做「开发写全地址、线上写相对路径」的分叉，
     * 分叉的那一版永远只在一边被测过。
     *
     * relay 是与 nes modeling 共用的那一个进程（账号、额度、skill 商店同一份）。
     * 想连线上的那台就 `RELAY_ORIGIN=https://nestudy.cn npm run dev`。
     */
    proxy: {
      '/api': {
        target: process.env.RELAY_ORIGIN || 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
