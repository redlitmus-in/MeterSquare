// vite.config.ts
import { defineConfig } from "file:///C:/Users/developer/Documents/metersquare-ERP/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/developer/Documents/metersquare-ERP/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import { resolve } from "path";
import viteCompression from "file:///C:/Users/developer/Documents/metersquare-ERP/frontend/node_modules/vite-plugin-compression/dist/index.mjs";
var __vite_injected_original_dirname = "C:\\Users\\developer\\Documents\\metersquare-ERP\\frontend";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    // Add gzip compression for production builds
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      // Only compress files larger than 10kb
      algorithm: "gzip",
      ext: ".gz"
    }),
    // Add brotli compression for better compression ratio
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      algorithm: "brotliCompress",
      ext: ".br"
    })
  ],
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "./src"),
      "@/components": resolve(__vite_injected_original_dirname, "./src/components"),
      "@/pages": resolve(__vite_injected_original_dirname, "./src/pages"),
      "@/hooks": resolve(__vite_injected_original_dirname, "./src/hooks"),
      "@/store": resolve(__vite_injected_original_dirname, "./src/store"),
      "@/types": resolve(__vite_injected_original_dirname, "./src/types"),
      "@/utils": resolve(__vite_injected_original_dirname, "./src/utils"),
      "@/api": resolve(__vite_injected_original_dirname, "./src/api"),
      "@/lib": resolve(__vite_injected_original_dirname, "./src/lib")
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Better file naming with hashes for cache busting
        entryFileNames: "assets/js/[name]-[hash].js",
        chunkFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (!assetInfo.name) {
            return "assets/images/[name]-[hash][extname]";
          }
          const info = assetInfo.name.split(".");
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/css/i.test(ext)) {
            return `assets/css/[name]-[hash][extname]`;
          } else {
            return `assets/[name]-[hash][extname]`;
          }
        },
        // Optimized manual chunks
        manualChunks: {
          // React core - always needed
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          // UI framework - split Radix UI for better caching
          "ui-vendor": ["framer-motion"],
          "radix-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tooltip", "@radix-ui/react-popover"],
          // Form handling
          "forms": ["react-hook-form", "zod", "@hookform/resolvers"],
          // Auth
          "auth": ["@supabase/supabase-js"],
          // Utils
          "utils": ["axios", "date-fns", "clsx", "tailwind-merge"],
          // Charts - lazy loaded but pre-chunked
          "charts": ["recharts"],
          // Export utilities - lazy loaded but pre-chunked
          "export-utils": ["jspdf", "jspdf-autotable", "xlsx", "file-saver"],
          // Icons - separate chunk for better caching
          "icons": ["lucide-react", "@heroicons/react"]
        }
      }
    },
    // Target modern browsers
    target: "es2020",
    // Optimize chunk size
    chunkSizeWarningLimit: 1e3,
    // Minification with terser
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.log", "console.info", "console.debug"]
      },
      format: {
        comments: false
      }
    },
    // No source maps in production for smaller size
    sourcemap: false,
    // CSS code splitting
    cssCodeSplit: true,
    // Report compressed size
    reportCompressedSize: false,
    // Assets inline limit
    assetsInlineLimit: 4096
  },
  server: {
    port: 3e3,
    host: true,
    allowedHosts: ["msq.kol.tel"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxkZXZlbG9wZXJcXFxcRG9jdW1lbnRzXFxcXG1ldGVyc3F1YXJlLUVSUFxcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcZGV2ZWxvcGVyXFxcXERvY3VtZW50c1xcXFxtZXRlcnNxdWFyZS1FUlBcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2RldmVsb3Blci9Eb2N1bWVudHMvbWV0ZXJzcXVhcmUtRVJQL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xyXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCdcclxuaW1wb3J0IHZpdGVDb21wcmVzc2lvbiBmcm9tICd2aXRlLXBsdWdpbi1jb21wcmVzc2lvbidcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW1xyXG4gICAgcmVhY3QoKSxcclxuICAgIC8vIEFkZCBnemlwIGNvbXByZXNzaW9uIGZvciBwcm9kdWN0aW9uIGJ1aWxkc1xyXG4gICAgdml0ZUNvbXByZXNzaW9uKHtcclxuICAgICAgdmVyYm9zZTogdHJ1ZSxcclxuICAgICAgZGlzYWJsZTogZmFsc2UsXHJcbiAgICAgIHRocmVzaG9sZDogMTAyNDAsIC8vIE9ubHkgY29tcHJlc3MgZmlsZXMgbGFyZ2VyIHRoYW4gMTBrYlxyXG4gICAgICBhbGdvcml0aG06ICdnemlwJyxcclxuICAgICAgZXh0OiAnLmd6JyxcclxuICAgIH0pLFxyXG4gICAgLy8gQWRkIGJyb3RsaSBjb21wcmVzc2lvbiBmb3IgYmV0dGVyIGNvbXByZXNzaW9uIHJhdGlvXHJcbiAgICB2aXRlQ29tcHJlc3Npb24oe1xyXG4gICAgICB2ZXJib3NlOiB0cnVlLFxyXG4gICAgICBkaXNhYmxlOiBmYWxzZSxcclxuICAgICAgdGhyZXNob2xkOiAxMDI0MCxcclxuICAgICAgYWxnb3JpdGhtOiAnYnJvdGxpQ29tcHJlc3MnLFxyXG4gICAgICBleHQ6ICcuYnInLFxyXG4gICAgfSlcclxuICBdLFxyXG4gIHJlc29sdmU6IHtcclxuICAgIGFsaWFzOiB7XHJcbiAgICAgICdAJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxyXG4gICAgICAnQC9jb21wb25lbnRzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9jb21wb25lbnRzJyksXHJcbiAgICAgICdAL3BhZ2VzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9wYWdlcycpLFxyXG4gICAgICAnQC9ob29rcyc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvaG9va3MnKSxcclxuICAgICAgJ0Avc3RvcmUnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjL3N0b3JlJyksXHJcbiAgICAgICdAL3R5cGVzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy90eXBlcycpLFxyXG4gICAgICAnQC91dGlscyc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvdXRpbHMnKSxcclxuICAgICAgJ0AvYXBpJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9hcGknKSxcclxuICAgICAgJ0AvbGliJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9saWInKSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICAvLyBCZXR0ZXIgZmlsZSBuYW1pbmcgd2l0aCBoYXNoZXMgZm9yIGNhY2hlIGJ1c3RpbmdcclxuICAgICAgICBlbnRyeUZpbGVOYW1lczogJ2Fzc2V0cy9qcy9bbmFtZV0tW2hhc2hdLmpzJyxcclxuICAgICAgICBjaHVua0ZpbGVOYW1lczogJ2Fzc2V0cy9qcy9bbmFtZV0tW2hhc2hdLmpzJyxcclxuICAgICAgICBhc3NldEZpbGVOYW1lczogKGFzc2V0SW5mbykgPT4ge1xyXG4gICAgICAgICAgaWYgKCFhc3NldEluZm8ubmFtZSl7XHJcbiAgICAgICAgICAgIHJldHVybiAnYXNzZXRzL2ltYWdlcy9bbmFtZV0tW2hhc2hdW2V4dG5hbWVdJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnN0IGluZm8gPSBhc3NldEluZm8ubmFtZS5zcGxpdCgnLicpO1xyXG4gICAgICAgICAgY29uc3QgZXh0ID0gaW5mb1tpbmZvLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgaWYgKC9wbmd8anBlP2d8c3ZnfGdpZnx0aWZmfGJtcHxpY28vaS50ZXN0KGV4dCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGBhc3NldHMvaW1hZ2VzL1tuYW1lXS1baGFzaF1bZXh0bmFtZV1gO1xyXG4gICAgICAgICAgfSBlbHNlIGlmICgvY3NzL2kudGVzdChleHQpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBgYXNzZXRzL2Nzcy9bbmFtZV0tW2hhc2hdW2V4dG5hbWVdYDtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBgYXNzZXRzL1tuYW1lXS1baGFzaF1bZXh0bmFtZV1gO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gT3B0aW1pemVkIG1hbnVhbCBjaHVua3NcclxuICAgICAgICBtYW51YWxDaHVua3M6IHtcclxuICAgICAgICAgIC8vIFJlYWN0IGNvcmUgLSBhbHdheXMgbmVlZGVkXHJcbiAgICAgICAgICAncmVhY3QtdmVuZG9yJzogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxyXG4gICAgICAgICAgLy8gVUkgZnJhbWV3b3JrIC0gc3BsaXQgUmFkaXggVUkgZm9yIGJldHRlciBjYWNoaW5nXHJcbiAgICAgICAgICAndWktdmVuZG9yJzogWydmcmFtZXItbW90aW9uJ10sXHJcbiAgICAgICAgICAncmFkaXgtdWknOiBbJ0ByYWRpeC11aS9yZWFjdC1kaWFsb2cnLCAnQHJhZGl4LXVpL3JlYWN0LXNlbGVjdCcsICdAcmFkaXgtdWkvcmVhY3QtdGFicycsICdAcmFkaXgtdWkvcmVhY3QtZHJvcGRvd24tbWVudScsICdAcmFkaXgtdWkvcmVhY3QtdG9vbHRpcCcsICdAcmFkaXgtdWkvcmVhY3QtcG9wb3ZlciddLFxyXG4gICAgICAgICAgLy8gRm9ybSBoYW5kbGluZ1xyXG4gICAgICAgICAgJ2Zvcm1zJzogWydyZWFjdC1ob29rLWZvcm0nLCAnem9kJywgJ0Bob29rZm9ybS9yZXNvbHZlcnMnXSxcclxuICAgICAgICAgIC8vIEF1dGhcclxuICAgICAgICAgICdhdXRoJzogWydAc3VwYWJhc2Uvc3VwYWJhc2UtanMnXSxcclxuICAgICAgICAgIC8vIFV0aWxzXHJcbiAgICAgICAgICAndXRpbHMnOiBbJ2F4aW9zJywgJ2RhdGUtZm5zJywgJ2Nsc3gnLCAndGFpbHdpbmQtbWVyZ2UnXSxcclxuICAgICAgICAgIC8vIENoYXJ0cyAtIGxhenkgbG9hZGVkIGJ1dCBwcmUtY2h1bmtlZFxyXG4gICAgICAgICAgJ2NoYXJ0cyc6IFsncmVjaGFydHMnXSxcclxuICAgICAgICAgIC8vIEV4cG9ydCB1dGlsaXRpZXMgLSBsYXp5IGxvYWRlZCBidXQgcHJlLWNodW5rZWRcclxuICAgICAgICAgICdleHBvcnQtdXRpbHMnOiBbJ2pzcGRmJywgJ2pzcGRmLWF1dG90YWJsZScsICd4bHN4JywgJ2ZpbGUtc2F2ZXInXSxcclxuICAgICAgICAgIC8vIEljb25zIC0gc2VwYXJhdGUgY2h1bmsgZm9yIGJldHRlciBjYWNoaW5nXHJcbiAgICAgICAgICAnaWNvbnMnOiBbJ2x1Y2lkZS1yZWFjdCcsICdAaGVyb2ljb25zL3JlYWN0J10sXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgLy8gVGFyZ2V0IG1vZGVybiBicm93c2Vyc1xyXG4gICAgdGFyZ2V0OiAnZXMyMDIwJyxcclxuICAgIC8vIE9wdGltaXplIGNodW5rIHNpemVcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMTAwMCxcclxuICAgIC8vIE1pbmlmaWNhdGlvbiB3aXRoIHRlcnNlclxyXG4gICAgbWluaWZ5OiAndGVyc2VyJyxcclxuICAgIHRlcnNlck9wdGlvbnM6IHtcclxuICAgICAgY29tcHJlc3M6IHtcclxuICAgICAgICBkcm9wX2NvbnNvbGU6IHRydWUsXHJcbiAgICAgICAgZHJvcF9kZWJ1Z2dlcjogdHJ1ZSxcclxuICAgICAgICBwdXJlX2Z1bmNzOiBbJ2NvbnNvbGUubG9nJywgJ2NvbnNvbGUuaW5mbycsICdjb25zb2xlLmRlYnVnJ11cclxuICAgICAgfSxcclxuICAgICAgZm9ybWF0OiB7XHJcbiAgICAgICAgY29tbWVudHM6IGZhbHNlXHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICAvLyBObyBzb3VyY2UgbWFwcyBpbiBwcm9kdWN0aW9uIGZvciBzbWFsbGVyIHNpemVcclxuICAgIHNvdXJjZW1hcDogZmFsc2UsXHJcbiAgICAvLyBDU1MgY29kZSBzcGxpdHRpbmdcclxuICAgIGNzc0NvZGVTcGxpdDogdHJ1ZSxcclxuICAgIC8vIFJlcG9ydCBjb21wcmVzc2VkIHNpemVcclxuICAgIHJlcG9ydENvbXByZXNzZWRTaXplOiBmYWxzZSxcclxuICAgIC8vIEFzc2V0cyBpbmxpbmUgbGltaXRcclxuICAgIGFzc2V0c0lubGluZUxpbWl0OiA0MDk2XHJcbiAgfSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDMwMDAsXHJcbiAgICBob3N0OiB0cnVlLFxyXG4gICAgYWxsb3dlZEhvc3RzOiBbJ21zcS5rb2wudGVsJ10sXHJcbiAgfSxcclxufSkiXSwKICAibWFwcGluZ3MiOiAiO0FBQTZWLFNBQVMsb0JBQW9CO0FBQzFYLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFDeEIsT0FBTyxxQkFBcUI7QUFINUIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBO0FBQUEsSUFFTixnQkFBZ0I7QUFBQSxNQUNkLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFdBQVc7QUFBQTtBQUFBLE1BQ1gsV0FBVztBQUFBLE1BQ1gsS0FBSztBQUFBLElBQ1AsQ0FBQztBQUFBO0FBQUEsSUFFRCxnQkFBZ0I7QUFBQSxNQUNkLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxNQUNYLEtBQUs7QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLE1BQy9CLGdCQUFnQixRQUFRLGtDQUFXLGtCQUFrQjtBQUFBLE1BQ3JELFdBQVcsUUFBUSxrQ0FBVyxhQUFhO0FBQUEsTUFDM0MsV0FBVyxRQUFRLGtDQUFXLGFBQWE7QUFBQSxNQUMzQyxXQUFXLFFBQVEsa0NBQVcsYUFBYTtBQUFBLE1BQzNDLFdBQVcsUUFBUSxrQ0FBVyxhQUFhO0FBQUEsTUFDM0MsV0FBVyxRQUFRLGtDQUFXLGFBQWE7QUFBQSxNQUMzQyxTQUFTLFFBQVEsa0NBQVcsV0FBVztBQUFBLE1BQ3ZDLFNBQVMsUUFBUSxrQ0FBVyxXQUFXO0FBQUEsSUFDekM7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUE7QUFBQSxRQUVOLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQixDQUFDLGNBQWM7QUFDN0IsY0FBSSxDQUFDLFVBQVUsTUFBSztBQUNsQixtQkFBTztBQUFBLFVBQ1Q7QUFDQSxnQkFBTSxPQUFPLFVBQVUsS0FBSyxNQUFNLEdBQUc7QUFDckMsZ0JBQU0sTUFBTSxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQ2hDLGNBQUksa0NBQWtDLEtBQUssR0FBRyxHQUFHO0FBQy9DLG1CQUFPO0FBQUEsVUFDVCxXQUFXLE9BQU8sS0FBSyxHQUFHLEdBQUc7QUFDM0IsbUJBQU87QUFBQSxVQUNULE9BQU87QUFDTCxtQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNGO0FBQUE7QUFBQSxRQUVBLGNBQWM7QUFBQTtBQUFBLFVBRVosZ0JBQWdCLENBQUMsU0FBUyxhQUFhLGtCQUFrQjtBQUFBO0FBQUEsVUFFekQsYUFBYSxDQUFDLGVBQWU7QUFBQSxVQUM3QixZQUFZLENBQUMsMEJBQTBCLDBCQUEwQix3QkFBd0IsaUNBQWlDLDJCQUEyQix5QkFBeUI7QUFBQTtBQUFBLFVBRTlLLFNBQVMsQ0FBQyxtQkFBbUIsT0FBTyxxQkFBcUI7QUFBQTtBQUFBLFVBRXpELFFBQVEsQ0FBQyx1QkFBdUI7QUFBQTtBQUFBLFVBRWhDLFNBQVMsQ0FBQyxTQUFTLFlBQVksUUFBUSxnQkFBZ0I7QUFBQTtBQUFBLFVBRXZELFVBQVUsQ0FBQyxVQUFVO0FBQUE7QUFBQSxVQUVyQixnQkFBZ0IsQ0FBQyxTQUFTLG1CQUFtQixRQUFRLFlBQVk7QUFBQTtBQUFBLFVBRWpFLFNBQVMsQ0FBQyxnQkFBZ0Isa0JBQWtCO0FBQUEsUUFDOUM7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBO0FBQUEsSUFFQSxRQUFRO0FBQUE7QUFBQSxJQUVSLHVCQUF1QjtBQUFBO0FBQUEsSUFFdkIsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsZUFBZTtBQUFBLFFBQ2YsWUFBWSxDQUFDLGVBQWUsZ0JBQWdCLGVBQWU7QUFBQSxNQUM3RDtBQUFBLE1BQ0EsUUFBUTtBQUFBLFFBQ04sVUFBVTtBQUFBLE1BQ1o7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLFdBQVc7QUFBQTtBQUFBLElBRVgsY0FBYztBQUFBO0FBQUEsSUFFZCxzQkFBc0I7QUFBQTtBQUFBLElBRXRCLG1CQUFtQjtBQUFBLEVBQ3JCO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixjQUFjLENBQUMsYUFBYTtBQUFBLEVBQzlCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
