import { isIsoDate } from '@domain/dates/period';
import type { CategorySource } from '@domain/suggestions/category-suggestion';
import type {
  CategoryOption,
  ImportBatchInput,
  ImportBatchResult,
  ImportRowInput,
} from '@domain/imports/import-batch';
import type { SqlDb } from '../sql-db';

const MAX_ROWS = 20_000;
const CATEGORY_SOURCES: readonly CategorySource[] = ['manual', 'regla', 'sugerencia', 'ninguna'];
const HASH = /^[0-9a-f]{64}$/;
/** Por debajo del límite de variables de SQLite. */
const CHUNK = 500;

/**
 * Categorías asignables a un movimiento: las subcategorías, con su categoría principal
 * delante (`Variables › Hogar`). Las principales solo agrupan (ADR-0009).
 */
export function categoryOptions(db: SqlDb): CategoryOption[] {
  return db
    .rows(
      `SELECT c.id, p.name || ' › ' || c.name AS label
       FROM categories c
       JOIN categories p ON p.id = c.parent_id
       WHERE c.archived = 0
       ORDER BY p.sort_order, p.name, c.sort_order, c.name`,
    )
    .map((row) => ({ id: Number(row['id']), label: String(row['label']) }));
}

/** De las huellas indicadas, las que ya tienen un movimiento guardado. */
export function existingDedupeHashes(db: SqlDb, hashes: readonly string[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const marks = chunk.map(() => '?').join(', ');
    found.push(
      ...db
        .rows(`SELECT dedupe_hash FROM transactions WHERE dedupe_hash IN (${marks})`, chunk)
        .map((row) => String(row['dedupe_hash'])),
    );
  }
  return found;
}

/**
 * Guarda un lote revisado (T6.5) en una única transacción: da de alta la cuenta si es la
 * primera vez que se ve, registra el lote y añade los movimientos nuevos. Los que ya estaban
 * guardados se cuentan como duplicados y no se tocan.
 */
export function commitImport(db: SqlDb, batch: ImportBatchInput): ImportBatchResult {
  return db.transaction(() => {
    const known = new Set(
      existingDedupeHashes(
        db,
        batch.rows.map((row) => row.dedupeHash),
      ),
    );
    const rows = batch.rows.filter((row) => !known.has(row.dedupeHash));
    const duplicates = batch.duplicateCount + known.size;
    if (rows.length === 0) {
      const accountName = findAccount(db, batch)?.name ?? defaultAccountName(batch);
      return { inserted: 0, duplicates, accountName, periods: [] };
    }
    const account = findAccount(db, batch) ?? createAccount(db, batch, rows);

    db.run(
      `INSERT INTO import_batches (account_id, bank_profile, file_name, file_sha256, date_from,
         date_to, rows_total, rows_new, rows_duplicate, rows_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        batch.profileId,
        batch.fileName,
        batch.fileSha256,
        batch.dateFrom,
        batch.dateTo,
        rows.length + duplicates + batch.errorCount,
        rows.length,
        duplicates,
        batch.errorCount,
      ],
    );
    const batchId = db.lastInsertId();

    for (const row of rows) {
      db.run(
        `INSERT INTO transactions (account_id, op_date, value_date, amount_cents,
           balance_after_cents, description, original_description, note, bank_reference,
           category_id, category_source, rule_id, origin, import_batch_id, dedupe_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM rules WHERE id = ?),
           'importado', ?, ?)`,
        [
          account.id,
          row.opDate,
          row.valueDate,
          row.amountCents,
          row.balanceAfterCents,
          row.description,
          row.originalDescription,
          row.note,
          row.bankReference,
          row.categoryId,
          row.categorySource,
          // Si la regla se ha borrado durante la revisión, la categoría se queda sin ella.
          row.ruleId,
          batchId,
          row.dedupeHash,
        ],
      );
    }

    const periods = db
      .rows('SELECT DISTINCT period FROM transactions WHERE import_batch_id = ? ORDER BY period', [
        batchId,
      ])
      .map((row) => String(row['period']));
    return { inserted: rows.length, duplicates, accountName: account.name, periods };
  });
}

interface Account {
  readonly id: number;
  readonly name: string;
}

/** La cuenta del extracto: misma entidad y mismos cuatro últimos dígitos del IBAN. */
export function findAccount(
  db: SqlDb,
  batch: Pick<ImportBatchInput, 'institution' | 'ibanLast4'>,
): Account | undefined {
  const [existing] = db.rows(
    'SELECT id, name FROM accounts WHERE institution = ? AND iban_last4 IS ? ORDER BY id LIMIT 1',
    [batch.institution, batch.ibanLast4],
  );
  return existing && { id: Number(existing['id']), name: String(existing['name']) };
}

const defaultAccountName = (batch: ImportBatchInput) =>
  batch.ibanLast4 ? `${batch.institution} ·${batch.ibanLast4}` : batch.institution;

/** Primera importación de una cuenta: se da de alta con el saldo anterior al extracto. */
function createAccount(
  db: SqlDb,
  batch: ImportBatchInput,
  rows: readonly ImportRowInput[],
): Account {
  const name = defaultAccountName(batch);
  const openingDate = rows.map((row) => row.opDate).sort()[0] ?? batch.dateFrom;
  db.run(
    `INSERT INTO accounts (name, institution, kind, iban_last4, opening_balance_cents,
       opening_date)
     VALUES (?, ?, 'corriente', ?, ?, ?)`,
    [name, batch.institution, batch.ibanLast4, batch.openingBalanceCents ?? 0, openingDate],
  );
  return { id: db.lastInsertId(), name };
}

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function importBatchParam(params: unknown): ImportBatchInput {
  const batch = record(params);
  const rows = batch['rows'];
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw invalid('rows');
  return {
    profileId: text(batch, 'profileId', 40),
    institution: text(batch, 'institution', 80),
    ibanLast4: nullable(batch, 'ibanLast4', (v) => typeof v === 'string' && /^\d{4}$/.test(v)),
    fileName: text(batch, 'fileName', 255),
    fileSha256: hash(batch, 'fileSha256'),
    dateFrom: date(batch, 'dateFrom'),
    dateTo: date(batch, 'dateTo'),
    openingBalanceCents: nullable(batch, 'openingBalanceCents', Number.isSafeInteger),
    rows: rows.map(rowParam),
    duplicateCount: count(batch, 'duplicateCount'),
    errorCount: count(batch, 'errorCount'),
  };
}

export function hashesParam(params: unknown): string[] {
  const hashes = record(params)['hashes'];
  if (!Array.isArray(hashes) || hashes.length > MAX_ROWS) throw invalid('hashes');
  return hashes.map((value: unknown) => {
    if (typeof value !== 'string' || !HASH.test(value)) throw invalid('hashes');
    return value;
  });
}

function rowParam(value: unknown): ImportRowInput {
  const row = record(value);
  const amountCents = row['amountCents'];
  if (!Number.isSafeInteger(amountCents) || amountCents === 0) throw invalid('amountCents');
  const categoryId = nullable<number>(row, 'categoryId', isId);
  const categorySource = CATEGORY_SOURCES.find((source) => source === row['categorySource']);
  if (!categorySource || (categorySource === 'ninguna') !== (categoryId === null)) {
    throw invalid('categorySource');
  }
  const ruleId = nullable<number>(row, 'ruleId', isId);
  if (ruleId !== null && categorySource !== 'regla') throw invalid('ruleId');
  return {
    opDate: date(row, 'opDate'),
    valueDate: nullable(row, 'valueDate', isIsoDate),
    amountCents: amountCents as number,
    balanceAfterCents: nullable(row, 'balanceAfterCents', Number.isSafeInteger),
    description: text(row, 'description', 500),
    originalDescription: text(row, 'originalDescription', 500),
    note: nullable(row, 'note', (v) => typeof v === 'string' && v.length > 0 && v.length <= 500),
    bankReference: nullable(row, 'bankReference', (v) => typeof v === 'string' && v.length <= 100),
    categoryId,
    categorySource,
    ruleId,
    dedupeHash: hash(row, 'dedupeHash'),
  };
}

type Fields = Readonly<Record<string, unknown>>;

const invalid = (field: string) => new RangeError(`Lote de importación no válido (${field}).`);

const isId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;

export function record(value: unknown): Fields {
  if (typeof value !== 'object' || value === null) throw invalid('forma');
  return value as Fields;
}

export function text(fields: Fields, key: string, max: number): string {
  const value = fields[key];
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw invalid(key);
  return value;
}

function hash(fields: Fields, key: string): string {
  const value = fields[key];
  if (typeof value !== 'string' || !HASH.test(value)) throw invalid(key);
  return value;
}

function date(fields: Fields, key: string): string {
  const value = fields[key];
  if (!isIsoDate(value)) throw invalid(key);
  return value;
}

function count(fields: Fields, key: string): number {
  const value = fields[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(key);
  return value as number;
}

export function nullable<T>(
  fields: Fields,
  key: string,
  isValid: (value: unknown) => boolean,
): T | null {
  const value = fields[key] ?? null;
  if (value !== null && !isValid(value)) throw invalid(key);
  return value as T | null;
}
