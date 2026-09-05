/// <reference types="vite/client" />

declare global {
  interface Window {
    api: import('../../preload/index').API
    getPathForFile?: (file: File) => string
  }
}

export {}
