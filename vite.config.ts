import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 自定义域根路径部署（public/CNAME → app.nestudy.cn）。
  // 若日后退回 <user>.github.io/studynest/ 子路径，改回 '/studynest/' 并删掉 public/CNAME。
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
