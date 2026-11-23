import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const playerLib = path.resolve(__dirname, '../player/src/client/lib')

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // Use Greenlight's streaming core straight from source.
      '@gl/player': path.join(playerLib, 'player.ts'),
      '@gl/gamepad': path.join(playerLib, 'input/gamepad.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome130',
  },
})
