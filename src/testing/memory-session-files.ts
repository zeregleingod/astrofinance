import type { SessionFiles } from '@worker/db/session-files';

/** Solo para tests: las copias de sesión de la pestaña en memoria, en lugar de OPFS. */
export function memorySessionFiles(): SessionFiles & { readonly files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    write: async (name, bytes) => void files.set(name, bytes.slice()),
    read: async (name) => files.get(name) ?? null,
  };
}
