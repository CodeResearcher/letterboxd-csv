/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY?: string;
  readonly VITE_UPCMDB_API_KEY?: string;
  readonly VITE_UPCDATABASE_API_KEY?: string;
  readonly VITE_EANDATA_API_KEY?: string;
  readonly VITE_UPCITEMDB_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}