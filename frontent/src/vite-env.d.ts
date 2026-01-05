/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Allow importing HTML files as raw strings
declare module '*.html?raw' {
  const content: string;
  export default content;
}

declare module '*.html' {
  const content: string;
  export default content;
}