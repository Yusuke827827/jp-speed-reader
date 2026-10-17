/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages などのサブパスに置く場合は BASE=/repo-name/ を指定してビルドする
  base: process.env.BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Flowa',
        short_name: 'Flowa',
        description: 'スクロールせずに、本もPDFも句ごとに読む / Read books and PDFs without scrolling, phrase by phrase',
        lang: 'ja',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3f0e8',
        theme_color: '#1d1f24',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // アプリ本体と PDF.js の付属ファイルは事前にキャッシュする
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}', 'pdfjs/**/*.{bcmap,pfb,ttf,wasm}'],
        globIgnores: ['tesseract/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // OCR エンジン（数 MB）は、初めて OCR を使ったときにキャッシュする
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract-core', expiration: { maxEntries: 10 } },
          },
          {
            // 日本語の学習データ（CDN から取得）
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('tesseract.js-data'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-lang',
              expiration: { maxEntries: 6 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
