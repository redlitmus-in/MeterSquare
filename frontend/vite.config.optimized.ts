import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import viteCompression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    // Add gzip compression for production builds
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240, // Only compress files larger than 10kb
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Add brotli compression for better compression ratio
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
    // Bundle analyzer (run with: npm run build -- --mode analyze)
    process.env.ANALYZE && visualizer({
      filename: './dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/pages': resolve(__dirname, './src/pages'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/store': resolve(__dirname, './src/store'),
      '@/types': resolve(__dirname, './src/types'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/api': resolve(__dirname, './src/api'),
      '@/lib': resolve(__dirname, './src/lib'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Better file naming with hashes for cache busting
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/css/i.test(ext)) {
            return `assets/css/[name]-[hash][extname]`;
          } else {
            return `assets/[name]-[hash][extname]`;
          }
        },
        // OPTIMIZED manual chunks to reduce initial bundle
        manualChunks: (id) => {
          // Core React - essential for app
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'react-core';
          }

          // Critical UI components
          if (id.includes('framer-motion') || id.includes('@radix-ui')) {
            return 'ui-core';
          }

          // Form handling - load when needed
          if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
            return 'forms';
          }

          // Authentication
          if (id.includes('@supabase')) {
            return 'auth';
          }

          // Heavy export utilities - LAZY LOAD ONLY
          if (id.includes('jspdf') || id.includes('xlsx') || id.includes('file-saver') || id.includes('html2canvas')) {
            return 'export-lazy';
          }

          // Charts - LAZY LOAD ONLY
          if (id.includes('recharts')) {
            return 'charts-lazy';
          }

          // Icons - separate for caching
          if (id.includes('lucide-react') || id.includes('@heroicons')) {
            return 'icons';
          }

          // Utilities
          if (id.includes('axios') || id.includes('date-fns') || id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'utils';
          }

          // All vendor dependencies not caught above
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    },
    // Target modern browsers
    target: 'es2020',
    // Optimize chunk size - increase limit to reduce warnings
    chunkSizeWarningLimit: 1500,
    // Minification with terser - KEEP ERRORS AND WARNINGS
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.info'], // Only remove logs, keep errors/warnings
        passes: 2, // Multiple passes for better compression
      },
      format: {
        comments: false
      },
      mangle: {
        safari10: true, // Fix Safari 10 issues
      }
    },
    // Source maps for debugging production issues
    sourcemap: 'hidden', // Hidden source maps for error reporting
    // CSS code splitting
    cssCodeSplit: true,
    // Report compressed size
    reportCompressedSize: false,
    // Assets inline limit - reduce for better caching
    assetsInlineLimit: 2048, // 2KB limit
    // Optimize dependencies
    commonjsOptions: {
      transformMixedEsModules: true,
    }
  },
  // Optimize dependencies pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      'framer-motion',
      'axios',
      'date-fns',
    ],
    exclude: [
      // Exclude heavy libraries from pre-bundling
      'jspdf',
      'jspdf-autotable',
      'xlsx',
      'recharts',
      'html2canvas'
    ]
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['msq.kol.tel'],
  },
})