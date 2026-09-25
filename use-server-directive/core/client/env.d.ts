interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  [key: string]: unknown;
  MODE: string;
  DEV: boolean;
  PROD: boolean;
}
