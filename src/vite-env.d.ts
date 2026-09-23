/// <reference types="vite/client" />
declare module '*.css'
interface ImportMetaEnv { readonly BASE_URL: string }
interface ImportMeta { readonly env: ImportMetaEnv }
