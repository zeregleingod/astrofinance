import { InjectionToken, Service, effect, inject, signal, untracked } from '@angular/core';
import {
  SESSION_DIRECTORY,
  SESSION_LOCK_PREFIX,
  SESSION_STORAGE_KEY,
  otherSlot,
  parseSessionRecord,
  resumeFileNames,
  sessionFileName,
  sessionIdOf,
  type SessionRecord,
} from '@domain/session/tab-session';
import { DbService } from '@services/db/db-service';

/** Lo que usa la sesión del navegador; los tests ponen el suyo. `null`: no lo hay. */
export interface TabSessionEnvironment {
  /** `sessionStorage`: de la pestaña, sobrevive a una recarga y se borra al cerrarla. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly locks: LockManager | null;
  /** La carpeta de OPFS con las copias de las sesiones. */
  readonly directory: (() => Promise<FileSystemDirectoryHandle>) | null;
  /** Donde se escucha `beforeunload`. */
  readonly window: Pick<Window, 'addEventListener'> | null;
  readonly newId: () => string;
}

export const TAB_SESSION_ENVIRONMENT = new InjectionToken<TabSessionEnvironment>(
  'TAB_SESSION_ENVIRONMENT',
  { providedIn: 'root', factory: browserEnvironment },
);

/**
 * Antes de borrar las copias de una pestaña cerrada se deja tiempo a que las pestañas que se
 * están recargando vuelvan a tomar su cerrojo: al recargar lo sueltan un momento.
 */
const SWEEP_DELAY_MS = 60_000;

/**
 * La sesión de la pestaña (ADR-0031). Mientras la pestaña está abierta, la BD del usuario se
 * copia en OPFS tras cada cambio, y al recargar se retoma de ahí. Al salir se borra la copia; si
 * se cierra la pestaña, la borra la próxima pestaña de la aplicación que se abra, cuando ve que
 * nadie tiene su cerrojo. La demo no se copia: recargarla vuelve a la landing.
 *
 * Al cerrar o recargar con cambios sin descargar, el navegador pregunta con su aviso genérico.
 */
@Service()
export class TabSession {
  private readonly db = inject(DbService);
  private readonly env = inject(TAB_SESSION_ENVIRONMENT);
  private readonly enabled =
    this.env.storage !== null && this.env.locks !== null && this.env.directory !== null;
  /** Lo guardado de la sesión anterior de esta pestaña, si se ha recargado. */
  private readonly stored = this.enabled ? this.read() : null;
  private record: SessionRecord | null = null;
  private started = false;
  private saving: Promise<void> = Promise.resolve();
  private saveQueued = false;

  private readonly resumingState = signal((this.stored?.slot ?? null) !== null);
  /** Se está retomando la BD tras una recarga: no se enseña aún ni la landing ni la app. */
  readonly resuming = this.resumingState.asReadonly();

  constructor() {
    this.env.window?.addEventListener('beforeunload', (event) => {
      if (this.db.mode() !== 'local' || !this.db.unsavedChanges()) return;
      // El navegador enseña su propio aviso; el texto no se puede cambiar.
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
    });
    effect(() => {
      this.db.localRevision();
      untracked(() => this.save());
    });
    effect(() => {
      const userData = this.db.hasUserData();
      const unsaved = this.db.unsavedChanges();
      untracked(() => {
        if (this.started && this.record && this.db.mode() === 'local') {
          this.remember({ ...this.record, userData, unsaved });
        }
      });
    });
    effect(() => {
      const mode = this.db.mode();
      const status = this.db.status();
      // Sin la BD del usuario abierta (demo, error) no hay nada que retomar al recargar.
      untracked(() => {
        if (this.started && status !== 'abriendo' && mode !== 'local') void this.forget();
      });
    });
  }

  /** Toma la pestaña y, si se ha recargado, retoma la BD del usuario. Una sola vez. */
  async start(): Promise<void> {
    if (this.started) return;
    if (!this.enabled) {
      this.started = true;
      return;
    }
    const stored = this.stored;
    let id = stored?.id ?? this.env.newId();
    // Una pestaña duplicada hereda el id de la original, que sigue abierta con su cerrojo.
    if (!(await this.hold(id))) {
      id = this.env.newId();
      await this.hold(id);
    }
    this.record = { id, slot: null, userData: false, unsaved: false };
    if (stored?.slot) {
      try {
        await this.db.resume(resumeFileNames(stored), stored);
        this.record = { ...stored, id, slot: id === stored.id ? stored.slot : null };
      } catch {
        // La copia no vale o ya no está: se empieza desde la landing.
        if (id === stored.id) await this.removeFiles(id);
      }
    }
    this.remember(this.record);
    this.started = true;
    this.resumingState.set(false);
    // La duplicada aún no tiene copia propia.
    if (this.db.mode() === 'local' && this.record.slot === null) this.save();
    setTimeout(() => void this.sweep(), SWEEP_DELAY_MS);
  }

  /** Cierra la BD y borra la copia de la sesión: lo que no se haya descargado se pierde. */
  async end(): Promise<void> {
    this.db.close();
    await this.forget();
  }

  /** Guarda la BD del usuario en la ranura libre. Los cambios seguidos se guardan una vez. */
  private save(): void {
    if (!this.started || !this.record || this.db.mode() !== 'local' || this.saveQueued) return;
    this.saveQueued = true;
    this.saving = this.saving
      .then(async () => {
        this.saveQueued = false;
        const record = this.record;
        if (!record || this.db.mode() !== 'local' || !this.db.ready()) return;
        const slot = otherSlot(record.slot);
        await this.db.saveSession(sessionFileName(record.id, slot));
        if (this.record?.id === record.id && this.db.mode() === 'local') {
          this.remember({ ...this.record, slot });
        }
      })
      // Sin copia, los datos siguen en memoria: solo dejan de sobrevivir a una recarga.
      .catch(() => undefined);
  }

  /** Olvida la copia de la sesión (sin soltar la pestaña) y la borra. */
  private async forget(): Promise<void> {
    const record = this.record;
    if (!record) return;
    if (record.slot !== null || record.userData || record.unsaved) {
      this.remember({ id: record.id, slot: null, userData: false, unsaved: false });
    }
    // Una copia que se esté escribiendo se borra cuando termine.
    await this.saving;
    await this.removeFiles(record.id);
  }

  private remember(record: SessionRecord): void {
    this.record = record;
    try {
      this.env.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Almacenamiento bloqueado: la sesión no sobrevivirá a una recarga.
    }
  }

  private read(): SessionRecord | null {
    try {
      return parseSessionRecord(this.env.storage?.getItem(SESSION_STORAGE_KEY) ?? null);
    } catch {
      return null;
    }
  }

  /** Toma el cerrojo de la sesión `id` hasta que se cierre la pestaña; `false` si ya es de otra. */
  private hold(id: string): Promise<boolean> {
    const locks = this.env.locks;
    if (!locks) return Promise.resolve(false);
    return new Promise((resolve) => {
      locks
        .request(SESSION_LOCK_PREFIX + id, { ifAvailable: true }, (lock) => {
          resolve(lock !== null);
          return lock ? new Promise<void>(() => undefined) : undefined;
        })
        .catch(() => resolve(false));
    });
  }

  /** Borra las copias de las pestañas que ya no están abiertas: nadie tiene su cerrojo. */
  private async sweep(): Promise<void> {
    const locks = this.env.locks;
    if (!locks) return;
    try {
      const ids = new Set<string>();
      const directory = await this.directory();
      for await (const name of (directory as unknown as { keys(): AsyncIterable<string> }).keys()) {
        const id = sessionIdOf(name);
        if (id !== null && id !== this.record?.id) ids.add(id);
      }
      for (const id of ids) {
        await locks.request(SESSION_LOCK_PREFIX + id, { ifAvailable: true }, async (lock) => {
          if (lock) await this.removeFiles(id);
        });
      }
    } catch {
      // Se reintentará la próxima vez que se abra la aplicación.
    }
  }

  private async removeFiles(id: string): Promise<void> {
    if (!this.env.directory) return;
    try {
      const directory = await this.directory();
      for (const slot of ['a', 'b'] as const) {
        await directory.removeEntry(sessionFileName(id, slot)).catch(() => undefined);
      }
    } catch {
      // Sin acceso a OPFS no hay copias que borrar.
    }
  }

  private directory(): Promise<FileSystemDirectoryHandle> {
    const directory = this.env.directory;
    if (!directory) return Promise.reject(new Error('Sin OPFS.'));
    return directory();
  }
}

function browserEnvironment(): TabSessionEnvironment {
  const storageManager = globalThis.navigator?.storage;
  return {
    storage: sessionStorageOrNull(),
    locks: globalThis.navigator?.locks ?? null,
    directory:
      typeof storageManager?.getDirectory === 'function'
        ? async () =>
            (await storageManager.getDirectory()).getDirectoryHandle(SESSION_DIRECTORY, {
              create: true,
            })
        : null,
    window: typeof window === 'undefined' ? null : window,
    newId: () => crypto.randomUUID(),
  };
}

function sessionStorageOrNull(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Almacenamiento bloqueado.
    return null;
  }
}
