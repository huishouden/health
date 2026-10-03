import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwaApp } from '@huishouden/pwa-kit/vite';

const googleFontsCache = (urlPattern: RegExp, cacheName: string) => ({
  urlPattern,
  handler: 'CacheFirst' as const,
  options: {
    cacheName,
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaApp({
      // Health's path on the suite's one site (pwa-kit docs/one-site.md).
      base: '/health/',
      name: 'Huishouden Health',
      shortName: 'Health',
      description: 'Medicines and care for everyone at home',
      url: 'https://huishouden-piekstra.web.app/health/',
      push: true,
      // Scan the label works offline once the reader has been used.
      ocr: true,
      themeColor: '#1b4332',
      backgroundColor: '#faf9f5',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'og.png'],
      overrides: {
        manifest: { categories: ['health', 'medical', 'lifestyle'] },
        workbox: {
          runtimeCaching: [
            googleFontsCache(/^https:\/\/fonts\.googleapis\.com\/.*/i, 'google-fonts-cache'),
            googleFontsCache(/^https:\/\/fonts\.gstatic\.com\/.*/i, 'gstatic-fonts-cache'),
          ],
        },
      },
    }),
  ],
});
