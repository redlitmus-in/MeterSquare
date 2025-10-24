import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import viteCompression from 'vite-plugin-compression'
import obfuscator from 'rollup-plugin-obfuscator'
import inject from '@rollup/plugin-inject'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'

  // Enable obfuscation only in production
  const ENABLE_OBFUSCATION = isProduction

  return {
    plugins: [
      react(),

      // Inject anti-debugging code globally
      ENABLE_OBFUSCATION && inject({
        '__ANTI_DEBUG__': resolve(__dirname, './src/utils/security/anti-debug.ts'),
      }),

      // Add gzip compression for production builds
      ENABLE_OBFUSCATION && viteCompression({
        verbose: false,
        disable: false,
        threshold: 10240,
        algorithm: 'gzip',
        ext: '.gz',
      }),

      // Add brotli compression for better compression ratio
      ENABLE_OBFUSCATION && viteCompression({
        verbose: false,
        disable: false,
        threshold: 10240,
        algorithm: 'brotliCompress',
        ext: '.br',
      }),

      // Visualizer for bundle analysis (dev only)
      !isProduction && visualizer({
        open: false,
        filename: 'dist/stats.html',
      })
    ].filter(Boolean),

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

    // Allow importing HTML as raw string
    assetsInclude: ['**/*.html'],

    build: {
      rollupOptions: {
        plugins: [
          // Advanced obfuscation for production
          ENABLE_OBFUSCATION && obfuscator({
            global: true,
            options: isProduction ? {
              // Full obfuscation for production
              optionsPreset: 'high-obfuscation',
              compact: true,
              controlFlowFlattening: true,
              debugProtection: true,
              disableConsoleOutput: true,
              stringArray: true,
              stringArrayEncoding: ['rc4'],
              selfDefending: true
            } : {
              // Lighter obfuscation for development
              optionsPreset: 'low-obfuscation',
              compact: true,
              identifierNamesGenerator: 'hexadecimal',
              renameGlobals: false,
              stringArray: true,
              stringArrayThreshold: 0.5,
              controlFlowFlattening: false,
              debugProtection: false,
              selfDefending: false
            }
          })
        ].filter(Boolean),

        output: {
          // Randomized file names with heavy hashing
          entryFileNames: isProduction
            ? `assets/[hash].js`
            : 'assets/js/[name]-[hash].js',
          chunkFileNames: isProduction
            ? `assets/[hash].js`
            : 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (!assetInfo.name) {
              return isProduction ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]';
            }
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return isProduction ? `assets/[hash][extname]` : `assets/images/[name]-[hash][extname]`;
            } else if (/css/i.test(ext)) {
              return isProduction ? `assets/[hash][extname]` : `assets/css/[name]-[hash][extname]`;
            } else {
              return isProduction ? `assets/[hash][extname]` : `assets/[name]-[hash][extname]`;
            }
          },

          // Code splitting - simplified for obfuscation
          manualChunks: ENABLE_OBFUSCATION ? undefined : {
            // Development chunks for easier debugging
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['framer-motion'],
            'radix-ui': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs'],
            'forms': ['react-hook-form', 'zod', '@hookform/resolvers'],
            'auth': ['@supabase/supabase-js'],
            'utils': ['axios', 'date-fns', 'clsx', 'tailwind-merge'],
          }
        },

        // Tree-shaking and side-effects optimization
        treeshake: {
          preset: 'recommended',
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false
        }
      },

      // Target modern browsers
      target: 'es2020',

      // Optimize chunk size
      chunkSizeWarningLimit: isProduction ? 2000 : 1000,

      // Advanced minification with Terser (disabled when obfuscation is on)
      minify: ENABLE_OBFUSCATION ? 'esbuild' : (isProduction ? 'terser' : 'esbuild'),
      terserOptions: (!ENABLE_OBFUSCATION && isProduction) ? {
        parse: {
          ecma: 2020
        },
        compress: {
          ecma: 2020,
          comparisons: false,
          inline: 2,
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
          passes: 3,
          global_defs: {
            '@__DEV__': false
          },
          module: true,
          toplevel: true,
          unsafe_arrows: true,
          unsafe_comps: true,
          unsafe_Function: true,
          unsafe_math: true,
          unsafe_symbols: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          unsafe_undefined: true,
          unused: true
        },
        mangle: {
          safari10: true,
          module: true,
          toplevel: true,
          eval: true,
          properties: {
            regex: /^_/
          }
        },
        format: {
          ecma: 2020,
          comments: false,
          ascii_only: true,
          wrap_iife: true,
          wrap_func_args: true
        },
        module: true,
        toplevel: true
      } : {},

      // Source maps only disabled in production
      sourcemap: isProduction ? false : true,

      // CSS code splitting
      cssCodeSplit: true,

      // Report compressed size
      reportCompressedSize: false,

      // Assets inline limit
      assetsInlineLimit: 4096,

      // Module preload
      modulePreload: {
        polyfill: true
      }
    },

    // Server configuration
    server: {
      port: 3000,
      host: true,
      allowedHosts: ['msq.kol.tel', 'localhost'],
      // Security headers for dev server
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      },
      // Disable file serving for source maps and original files
      middlewareMode: false,
      sourcemapIgnoreList: () => true
    },

    // Define global constants
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __PRODUCTION__: isProduction
    },

    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@supabase/supabase-js',
        'axios',
        'crypto-js'
      ],
      exclude: ['@rollup/plugin-inject']
    },

    // Environment variable prefix
    envPrefix: 'VITE_'
  }
})