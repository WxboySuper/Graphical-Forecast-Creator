/// <reference types="vite/client" />

declare const __GFC_COMING_SOON__: boolean;
declare const __GFC_FIREBASE_API_KEY__: string;
declare const __GFC_FIREBASE_AUTH_DOMAIN__: string;
declare const __GFC_FIREBASE_PROJECT_ID__: string;
declare const __GFC_FIREBASE_APP_ID__: string;

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  var __GFC_COMING_SOON__: boolean;
  var __GFC_FIREBASE_API_KEY__: string;
  var __GFC_FIREBASE_AUTH_DOMAIN__: string;
  var __GFC_FIREBASE_PROJECT_ID__: string;
  var __GFC_FIREBASE_APP_ID__: string;
}

export {};
