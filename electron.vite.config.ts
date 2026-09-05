import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // 强制 dev server 监听 IPv4 127.0.0.1：默认只监听 IPv6 ::1 时，
    // electron 访问 http://localhost:5173 会 ERR_CONNECTION_REFUSED 导致窗口黑屏
    server: {
      host: '127.0.0.1'
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
