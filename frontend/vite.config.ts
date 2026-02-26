import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'events', 'util', 'stream', 'process', 'crypto'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  optimizeDeps: {
    include: [
      '@multiversx/sdk-wallet',
      '@multiversx/sdk-wallet-connect-provider',
      '@multiversx/sdk-extension-provider',
      '@multiversx/sdk-web-wallet-provider',
      '@multiversx/sdk-core',
    ],
  },
  build: {
    // Split vendor libraries into separate chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes rarely, cached long-term
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // MultiversX SDK — large but stable
          'vendor-mvx': [
            '@multiversx/sdk-core',
            '@multiversx/sdk-network-providers',
            '@multiversx/sdk-wallet',
          ],
        },
      },
    },
    // Raise warning limit since vendor chunks are expected to be large
    chunkSizeWarningLimit: 1600,
  },
})
