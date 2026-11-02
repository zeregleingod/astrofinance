import { TestBed } from '@angular/core/testing';
import {
  SESSION_LOCK_PREFIX,
  SESSION_STORAGE_KEY,
  parseSessionRecord,
  sessionFileName,
} from '@domain/session/tab-session';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorkerWith } from '../../../testing/in-process-db-worker';
import { memorySessionFiles } from '../../../testing/memory-session-files';
import { TAB_SESSION_ENVIRONMENT, TabSession, type TabSessionEnvironment } from './tab-session';

const FIRST = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SECOND = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER = '16fd2706-8baf-433b-82eb-8c7fada847da';

/**
 * Un navegador falso con lo que usa la sesión: `sessionStorage`, Web Locks y la carpeta de OPFS,
 * cuyas copias son las mismas que escribe el worker. `reload` simula recargar la pestaña: suelta
 * sus cerrojos y conserva el resto.
 */
function fakeBrowser() {
  const files = memorySessionFiles();
  const stored = new Map<string, string>();
  const held = new Set<string>();
  const listeners: ((event: Event) => void)[] = [];
  const ids = [FIRST, SECOND];
  const locks = {
    request: (
      name: string,
      _options: LockOptions,
      callback: (lock: Lock | null) => unknown,
    ): Promise<unknown> => {
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name, mode: 'exclusive' })).finally(() =>
        held.delete(name),
      );
    },
  } as unknown as LockManager;
  const directory = {
    removeEntry: async (name: string) => void files.files.delete(name),
    keys: async function* () {
      yield* files.files.keys();
    },
  } as unknown as FileSystemDirectoryHandle;
  const environment: TabSessionEnvironment = {
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
    },
    locks,
    directory: async () => directory,
    window: {
      addEventListener: (_type: string, listener: (event: Event) => void) =>
        void listeners.push(listener),
    } as Pick<Window, 'addEventListener'>,
    newId: () => ids.shift() ?? OTHER,
  };

  return {
    files: files.files,
    held,
    record: () => parseSessionRecord(stored.get(SESSION_STORAGE_KEY) ?? null),
    /** Lo que haría el navegador al cerrar o recargar: `true` si pregunta antes. */
    asksBeforeUnload: () => {
      const event = new Event('beforeunload', { cancelable: true });
      for (const listener of listeners) listener(event);
      return event.defaultPrevented;
    },
    /** Abre la aplicación en la pestaña; con `start`, espera a que la sesión empiece. */
    async open(start = true) {
      listeners.length = 0;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorkerWith(files) },
          { provide: TAB_SESSION_ENVIRONMENT, useValue: environment },
        ],
      });
      const db = TestBed.inject(DbService);
      const session = TestBed.inject(TabSession);
      if (start) await session.start();
      return { db, session };
    },
    reload(start = true) {
      held.clear();
      return this.open(start);
    },
  };
}

/** Deja correr los efectos y lo que estén guardando hasta que se cumpla `assertion`. */
async function settled(assertion: () => void): Promise<void> {
  await vi.waitFor(() => {
    TestBed.tick();
    assertion();
  });
}

describe('TabSession (ADR-0031)', () => {
  it('copia la BD del usuario tras cada cambio y la retoma al recargar', async () => {
    const browser = fakeBrowser();
    const { db } = await browser.open();

    await db.openLocal();
    await settled(() => expect(browser.record()?.slot).toBe('a'));
    expect(browser.files.has(sessionFileName(FIRST, 'a'))).toBe(true);

    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    // Cada copia va a la otra ranura: si una se queda a medias, queda la anterior.
    await settled(() => expect(browser.record()).toMatchObject({ slot: 'b', unsaved: true }));

    const reloaded = await browser.reload();

    expect(reloaded.session.resuming()).toBe(false);
    expect(reloaded.db.mode()).toBe('local');
    expect(reloaded.db.unsavedChanges()).toBe(true);
    expect(reloaded.db.hasUserData()).toBe(true);
    expect((await reloaded.db.categoryTree()).map((group) => group.name)).toContain('Mascotas');
    expect(browser.record()?.id).toBe(FIRST);
  });

  it('mientras retoma lo dice, para no enseñar la landing', async () => {
    const browser = fakeBrowser();
    const { db } = await browser.open();
    await db.openLocal();
    await settled(() => expect(browser.record()?.slot).toBe('a'));

    // La copia ha desaparecido (p. ej. el navegador ha borrado el almacenamiento).
    browser.files.clear();
    const { db: reloaded, session } = await browser.reload(false);
    expect(session.resuming()).toBe(true);

    await session.start();
    expect(session.resuming()).toBe(false);
    expect(reloaded.ready()).toBe(false);
  });

  it('la demo no se copia: al recargar vuelve a la landing', async () => {
    const browser = fakeBrowser();
    const { db } = await browser.open();

    await db.openDemo();
    TestBed.tick();
    const reloaded = await browser.reload();

    expect(browser.files.size).toBe(0);
    expect(reloaded.db.ready()).toBe(false);
  });

  it('al salir cierra la BD y borra su copia', async () => {
    const browser = fakeBrowser();
    const { db, session } = await browser.open();
    await db.openLocal();
    await settled(() => expect(browser.record()?.slot).toBe('a'));

    await session.end();

    expect(db.ready()).toBe(false);
    expect(browser.files.size).toBe(0);
    expect(browser.record()).toMatchObject({ id: FIRST, slot: null });
    expect((await browser.reload()).db.ready()).toBe(false);
  });

  it('una pestaña duplicada retoma los datos de la original con un id propio', async () => {
    const browser = fakeBrowser();
    const { db } = await browser.open();
    await db.openLocal();
    await settled(() => expect(browser.record()?.slot).toBe('a'));

    // Sin soltar el cerrojo de la original, que sigue abierta.
    const duplicate = await browser.open();

    expect(duplicate.db.mode()).toBe('local');
    await settled(() => expect(browser.record()).toMatchObject({ id: SECOND, slot: 'a' }));
    expect(browser.files.has(sessionFileName(FIRST, 'a'))).toBe(true);
    expect(browser.files.has(sessionFileName(SECOND, 'a'))).toBe(true);
  });

  it('borra las copias de las pestañas cerradas, pero no las de las abiertas', async () => {
    vi.useFakeTimers();
    try {
      const browser = fakeBrowser();
      browser.files.set(sessionFileName(OTHER, 'a'), new Uint8Array([1]));
      browser.files.set(sessionFileName(SECOND, 'b'), new Uint8Array([1]));
      browser.held.add(SESSION_LOCK_PREFIX + SECOND);
      await browser.open();

      await vi.advanceTimersByTimeAsync(60_000);

      expect([...browser.files.keys()]).toEqual([sessionFileName(SECOND, 'b')]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el navegador pregunta antes de cerrar solo si hay cambios sin descargar', async () => {
    const browser = fakeBrowser();
    const { db } = await browser.open();
    await db.openLocal();
    expect(browser.asksBeforeUnload()).toBe(false);

    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    expect(browser.asksBeforeUnload()).toBe(true);

    db.markSaved();
    expect(browser.asksBeforeUnload()).toBe(false);
  });

  it('sin OPFS ni cerrojos la BD funciona igual, sin copia', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorkerWith() },
        {
          provide: TAB_SESSION_ENVIRONMENT,
          useValue: {
            storage: null,
            locks: null,
            directory: null,
            window: null,
            newId: () => FIRST,
          } satisfies TabSessionEnvironment,
        },
      ],
    });
    const db = TestBed.inject(DbService);
    const session = TestBed.inject(TabSession);
    await session.start();
    await db.openLocal();
    TestBed.tick();

    expect(session.resuming()).toBe(false);
    expect(db.ready()).toBe(true);
  });
});
