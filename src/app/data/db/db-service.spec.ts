import { TestBed } from '@angular/core/testing';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { DB_WORKER_FACTORY, DbService, type DbWorker } from './db-service';

describe('DbService', () => {
  function setup(factory: () => DbWorker = inProcessDbWorker) {
    const created: DbWorker[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DB_WORKER_FACTORY,
          useValue: () => {
            const worker = factory();
            created.push(worker);
            return worker;
          },
        },
      ],
    });
    return { db: TestBed.inject(DbService), created };
  }

  it('sabe si la BD del usuario tiene ya algo suyo; la plantilla y la demo no cuentan', async () => {
    const { db } = setup();
    await db.openLocal();
    expect(db.hasUserData()).toBe(false);

    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    expect(db.hasUserData()).toBe(true);

    db.close();
    expect(db.hasUserData()).toBe(false);

    await db.openDemo();
    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    expect(db.hasUserData()).toBe(false);
  });

  it('empieza cerrada y sin modo', () => {
    const { db, created } = setup();
    expect(db.status()).toBe('cerrada');
    expect(db.mode()).toBeNull();
    expect(created).toHaveLength(0);
  });

  it('abre la demo en un worker y permite consultarla', async () => {
    const { db } = setup();
    const opening = db.openDemo();
    expect(db.status()).toBe('abriendo');
    await opening;

    expect(db.status()).toBe('lista');
    expect(db.mode()).toBe('demo');
    expect(await db.periods()).toEqual(['2026-07', '2026-08', '2026-09']);
    expect((await db.monthReport('2026-09')).period).toBe('2026-09');
    expect((await db.transactions('2026-09')).length).toBeGreaterThan(0);
  });

  it('da de alta categorías y avisa de que los datos han cambiado', async () => {
    const { db } = setup();
    await db.openLocal();
    const version = db.dataVersion();

    const id = await db.createCategory({ parentId: null, name: 'Mascotas', color: '#4F46E5' });
    await db.createCategory({ parentId: id, name: 'Veterinario', kind: 'gasto' });

    expect(db.dataVersion()).toBe(version + 2);
    expect((await db.categoryTree()).at(-1)).toMatchObject({
      id,
      name: 'Mascotas',
      color: '#4F46E5',
      subcategories: [{ name: 'Veterinario', kind: 'gasto' }],
    });
    await expect(
      db.createCategory({ parentId: id, name: 'veterinario', kind: 'gasto' }),
    ).rejects.toMatchObject({ name: 'CategoryError', message: 'nombre-repetido' });
    expect(db.dataVersion()).toBe(version + 2);
  });

  it('cambia y elimina categorías, y avisa de cada cambio', async () => {
    const { db } = setup();
    await db.openDemo();
    const version = db.dataVersion();
    const used = (await db.categoryTree()).find((group) => group.name === 'Variables');
    const [first] = used?.subcategories ?? [];
    if (!used || !first) throw new Error('Sin Variables en la demo');

    await db.updateCategory({ id: used.id, name: 'Día a día', color: '#0EA5E9' });
    await db.updateCategory({ id: first.id, name: first.name, kind: 'ahorro' });
    const changed = (await db.categoryTree()).find((group) => group.id === used.id);
    expect(changed).toMatchObject({ name: 'Día a día', color: '#0EA5E9' });
    expect(changed?.subcategories[0]?.kind).toBe('ahorro');

    expect(await db.deleteCategory(used.id)).toBeGreaterThan(0);
    expect((await db.categoryTree()).map((group) => group.name)).not.toContain('Día a día');
    expect(db.dataVersion()).toBe(version + 3);
    await expect(db.deleteCategory(used.id)).rejects.toMatchObject({
      message: 'categoria-inexistente',
    });
  });

  it('no crea dos workers si se pide abrir la demo dos veces a la vez', async () => {
    const { db, created } = setup();
    await Promise.all([db.openDemo(), db.openDemo()]);
    await db.openDemo();
    expect(created).toHaveLength(1);
  });

  it('al cerrar termina el worker, cambia la versión de datos y rechaza consultas', async () => {
    const { db, created } = setup();
    await db.openDemo();
    const version = db.dataVersion();

    db.close();

    expect(db.status()).toBe('cerrada');
    expect(db.mode()).toBeNull();
    expect(db.dataVersion()).toBeGreaterThan(version);
    expect((created[0] as ReturnType<typeof inProcessDbWorker>).terminated()).toBe(true);
    await expect(db.periods()).rejects.toThrow(/ninguna base de datos/);
  });

  it('pasa a error si el worker no puede abrir la demo', async () => {
    const { db } = setup(() => ({
      postMessage: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      terminate: () => undefined,
    }));
    vi.useFakeTimers();
    const opening = db.openDemo();
    vi.advanceTimersByTime(60_000);
    await expect(opening).rejects.toThrow();
    vi.useRealTimers();
    expect(db.status()).toBe('error');
    expect(db.mode()).toBeNull();
  });
});
