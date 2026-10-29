import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createDbHandlers } from './db-handlers';

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
});
