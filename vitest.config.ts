import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['src/**/*.test.ts'],
    // *.db.test.ts need better-sqlite3, built for Electron: `npm run test:db` runs them inside Electron.
    exclude: process.env.GL_DB_TESTS ? [] : ['src/**/*.db.test.ts']
  }
})
