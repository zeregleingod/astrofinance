import { SESSION_DIRECTORY, isSessionFileName } from '@domain/session/tab-session';

/**
 * Dónde guarda el worker las copias de la sesión de la pestaña (ADR-0031). Solo trabaja con
 * nombres de copia de sesión (`sesion-<id>-<ranura>.db`), nunca con rutas.
 */
export interface SessionFiles {
  write(name: string, bytes: Uint8Array): Promise<void>;
  /** El contenido de la copia, o `null` si no existe. */
  read(name: string): Promise<Uint8Array | null>;
}

/** Lo que se usa de `FileSystemSyncAccessHandle`, que solo existe en los workers. */
interface SyncAccessHandle {
  truncate(size: number): void;
  write(buffer: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
}

/**
 * Las copias en OPFS, el almacenamiento privado del origen. Se escriben con un acceso síncrono,
 * que es rápido y está en todos los navegadores con OPFS, pero solo dentro de un worker.
 */
export const opfsSessionFiles: SessionFiles = {
  async write(name, bytes) {
    const file = await (await directory()).getFileHandle(checked(name), { create: true });
    const handle = await (
      file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
    ).createSyncAccessHandle();
    try {
      handle.truncate(0);
      handle.write(bytes, { at: 0 });
      handle.flush();
    } finally {
      handle.close();
    }
  },
  async read(name) {
    try {
      const file = await (await directory()).getFileHandle(checked(name));
      return new Uint8Array(await (await file.getFile()).arrayBuffer());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return null;
      throw error;
    }
  },
};

async function directory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(SESSION_DIRECTORY, { create: true });
}

function checked(name: string): string {
  if (!isSessionFileName(name)) throw new RangeError('Copia de sesión no válida.');
  return name;
}
