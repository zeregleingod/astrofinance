import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 010: idioma del nombre de cada categoría', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS.slice(0, 9));
  });

  afterEach(() => raw.close());

  const category = (id: number, name: string, translations: Record<string, string> = {}) => {
    db.run('INSERT INTO categories (id, name, color) VALUES (?, ?, NULL)', [id, name]);
    for (const [language, translation] of Object.entries(translations)) {
      db.run('INSERT INTO category_translations VALUES (?, ?, ?)', [id, language, translation]);
    }
  };
  const languageOf = (id: number) => db.value('SELECT language FROM categories WHERE id = ?', [id]);
  const nameOf = (id: number) => db.value('SELECT name FROM categories WHERE id = ?', [id]);
  const translationsOf = (id: number) =>
    db
      .rows(
        'SELECT language, name FROM category_translations WHERE category_id = ? ORDER BY language',
        [id],
      )
      .map((row) => `${String(row['language'])}:${String(row['name'])}`);

  it('da por escritos en español los nombres sin traducción al español', () => {
    category(1, 'Comida', { en: 'Groceries' });
    migrate(db, MIGRATIONS);

    expect(languageOf(1)).toBe('es');
    expect(nameOf(1)).toBe('Comida');
    expect(translationsOf(1)).toEqual(['en:Groceries']);
  });

  it('con traducción al español, el nombre es del primer idioma que no se traduce', () => {
    category(1, 'Menjar', { es: 'Comida', en: 'Groceries' });
    category(2, 'Food', { es: 'Comida 2', ca: 'Menjar 2' });
    migrate(db, MIGRATIONS);

    expect(languageOf(1)).toBe('ca');
    expect(translationsOf(1)).toEqual(['en:Groceries', 'es:Comida']);
    expect(languageOf(2)).toBe('en');
  });

  it('si se traducen todos los idiomas, el nombre pasa a ser el español', () => {
    category(1, 'Lebensmittel', { es: 'Comida', ca: 'Menjar', en: 'Groceries' });
    migrate(db, MIGRATIONS);

    expect(languageOf(1)).toBe('es');
    expect(nameOf(1)).toBe('Comida');
    expect(translationsOf(1)).toEqual(['ca:Menjar', 'en:Groceries']);
  });

  it('no cambia el nombre si lo usa ya una hermana', () => {
    category(1, 'Comida');
    category(2, 'Lebensmittel', { es: 'Comida', ca: 'Menjar', en: 'Groceries' });
    migrate(db, MIGRATIONS);

    expect(nameOf(2)).toBe('Lebensmittel');
  });

  it('las categorías nuevas se escriben en español si no se dice otro idioma', () => {
    migrate(db, MIGRATIONS);
    db.run(`INSERT INTO categories (id, name) VALUES (1, 'Comida')`);

    expect(languageOf(1)).toBe('es');
    expect(() => db.run(`UPDATE categories SET language = 'ES' WHERE id = 1`)).toThrow();
  });
});
