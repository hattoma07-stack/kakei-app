import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages はプロジェクトサイト（https://<user>.github.io/kakei-app/）で配信されるため、
// 本番ビルドだけベースパスを付ける。開発サーバーは従来どおりルート('/')。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/kakei-app/' : '/',
  plugins: [react()],
  server: { port: 5173, host: true },
}))
