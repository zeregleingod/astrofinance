import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { sessionFileName } from '@domain/session/tab-session';
import { memorySessionFiles } from '../../../testing/memory-session-files';
import { createDbHandlers } from './db-handlers';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('createDbHandlers', () => {
  it('falla si se consulta sin una BD abierta', () => {
    const handlers = createDbHandlers(sqlite3InitModule);
    expect(() => handlers.periods(undefined)).toThrow(/ninguna base de datos/);
  });

  it('abre la demo, la consulta y la cierra', async () => {
    const handlers = createDbHandlers(sqlite3InitModule);
    await handlers.openDemo(undefined);

    expect(await handlers.periods(undefined)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect((await handlers.monthReport({ period: '2026-09' })).period).toBe('2026-09');
    expect((await handlers.yearReport({ year: 2026 })).year).toBe(2026);
    expect((await handlers.transactions({ period: '2026-09' })).length).toBeGreaterThan(0);
    expect(
      (await handlers.summaryTransactionIds({ period: '2026-09', total: 'gastos' })).length,
    ).toBeGreaterThan(0);

    handlers.close(undefined);
    expect(() => handlers.periods(undefined)).toThrow(/ninguna base de datos/);
  });

  it('reabrir la demo empieza de cero', async () => {
    const handlers = createDbHandlers(sqlite3InitModule);
    await handlers.openDemo(undefined);
    const before = (await handlers.transactions({ period: '2026-09' })).length;
    await handlers.openDemo(undefined);
    expect((await handlers.transactions({ period: '2026-09' })).length).toBe(before);
  });

  it('valida los parámetros que llegan del hilo principal', async () => {
    const handlers = createDbHandlers(sqlite3InitModule);
    await handlers.openDemo(undefined);
    expect(() => handlers.monthReport({ period: "2026-09' OR 1=1 --" })).toThrow(RangeError);
    expect(() => handlers.transactions(null as unknown as { period: string })).toThrow(RangeError);
    expect(() => handlers.yearReport({ year: 2026.5 })).toThrow(RangeError);
    expect(() =>
      handlers.summaryTransactionIds({ period: '2026-09', total: 'otros' as 'gastos' }),
    ).toThrow(RangeError);
    expect(() => handlers.summaryTransactionIds({ period: '2026-9', total: 'gastos' })).toThrow(
      RangeError,
    );
    expect(() => handlers.yearReport({ year: '2026' as unknown as number })).toThrow(RangeError);
    expect(() =>
      handlers.createCategory({ parentId: 1, name: 'A', kind: 'otro' as 'gasto' }),
    ).toThrow(RangeError);
    expect(() =>
      handlers.reorderCategories({ parentId: null, ids: ['1'] as unknown as number[] }),
    ).toThrow(RangeError);
  });

  describe('sesión de la pestaña (ADR-0031)', () => {
    const slotA = sessionFileName(SESSION, 'a');
    const slotB = sessionFileName(SESSION, 'b');

    it('guarda la BD abierta y otra pestaña (otro worker) la retoma tal cual', async () => {
      const files = memorySessionFiles();
      const first = createDbHandlers(sqlite3InitModule, files);
      await first.openNew(undefined);
      await first.createCategory({ parentId: null, name: 'Mascotas', color: null });
      await first.saveSession({ name: slotA });

      const second = createDbHandlers(sqlite3InitModule, files);
      await second.openSession({ names: [slotA, slotB] });

      expect((await second.categoryTree(undefined)).map((group) => group.name)).toContain(
        'Mascotas',
      );
    });

    it('si la última copia no existe o está a medias, retoma la anterior', async () => {
      const files = memorySessionFiles();
      const handlers = createDbHandlers(sqlite3InitModule, files);
      await handlers.openNew(undefined);
      await handlers.saveSession({ name: slotA });
      files.files.set(slotB, files.files.get(slotA)?.slice(0, 100) ?? new Uint8Array());

      const resumed = createDbHandlers(sqlite3InitModule, files);
      await resumed.openSession({ names: [slotB, slotA] });
      expect((await resumed.categoryTree(undefined)).length).toBeGreaterThan(0);

      files.files.clear();
      await expect(resumed.openSession({ names: [slotB, slotA] })).rejects.toThrow(/copia/);
      // La BD que estaba abierta sigue ahí.
      expect((await resumed.categoryTree(undefined)).length).toBeGreaterThan(0);
    });

    it('solo trabaja con nombres de copia de sesión y necesita dónde guardarlas', async () => {
      const handlers = createDbHandlers(sqlite3InitModule, memorySessionFiles());
      await handlers.openNew(undefined);

      await expect(handlers.saveSession({ name: '../astrofinance.db' })).rejects.toThrow(
        RangeError,
      );
      await expect(handlers.openSession({ names: [slotA, slotB, slotA] })).rejects.toThrow(
        RangeError,
      );

      const withoutFiles = createDbHandlers(sqlite3InitModule);
      await withoutFiles.openNew(undefined);
      await expect(withoutFiles.saveSession({ name: slotA })).rejects.toThrow(/sesión/);
    });
  });
});
