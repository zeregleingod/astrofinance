/**
 * La sesión de una pestaña (ADR-0031): mientras la pestaña está abierta, la BD del usuario se
 * copia en el almacenamiento privado del navegador (OPFS) para que sobreviva a una recarga. Lo
 * que se recuerda de la sesión va en `sessionStorage`, que es de la pestaña y no contiene datos
 * financieros: solo su id, qué copia es la última y dos marcas.
 */

/** Las dos ranuras de la copia: se escribe siempre en la que no tiene la última. */
export type SessionSlot = 'a' | 'b';

export interface SessionRecord {
  /** Id de la pestaña: nombra sus copias y el cerrojo que dice que sigue abierta. */
  readonly id: string;
  /** La ranura con la última copia; `null` si aún no hay ninguna. */
  readonly slot: SessionSlot | null;
  /** La BD tiene algo del usuario (ver `DbService.hasUserData`). */
  readonly userData: boolean;
  /** Hay cambios que no están en ninguna copia descargada. */
  readonly unsaved: boolean;
}

/** Clave de `sessionStorage` con el `SessionRecord` de la pestaña. */
export const SESSION_STORAGE_KEY = 'astrofinance.session';

/** Carpeta de OPFS con las copias de las sesiones. */
export const SESSION_DIRECTORY = 'sesiones';

/** Prefijo del cerrojo (Web Locks) que tiene cada pestaña mientras está abierta. */
export const SESSION_LOCK_PREFIX = 'astrofinance.session.';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^sesion-([0-9a-f-]{36})-([ab])\.db$/;

/** Un id de sesión: un UUID en minúsculas, como los de `crypto.randomUUID`. */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

/** El fichero de la copia de la sesión `id` en la ranura `slot`. */
export function sessionFileName(id: string, slot: SessionSlot): string {
  return `sesion-${id}-${slot}.db`;
}

/** El id de la sesión de un fichero de copia, o `null` si no es una copia de sesión. */
export function sessionIdOf(fileName: string): string | null {
  const id = FILE.exec(fileName)?.[1];
  return id !== undefined && isSessionId(id) ? id : null;
}

/** Un nombre de fichero de copia de sesión válido: el worker no escribe ni lee otros. */
export function isSessionFileName(value: unknown): value is string {
  return typeof value === 'string' && sessionIdOf(value) !== null;
}

export function otherSlot(slot: SessionSlot | null): SessionSlot {
  return slot === 'a' ? 'b' : 'a';
}

/**
 * Los ficheros de donde retomar una sesión, del más reciente al anterior: si la última copia se
 * quedó a medias (se recargó mientras se escribía), queda la otra.
 */
export function resumeFileNames(record: SessionRecord): string[] {
  if (record.slot === null) return [];
  return [
    sessionFileName(record.id, record.slot),
    sessionFileName(record.id, otherSlot(record.slot)),
  ];
}

/** Lee el registro guardado; `null` si no hay o no vale (p. ej. lo ha tocado alguien). */
export function parseSessionRecord(json: string | null): SessionRecord | null {
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { id, slot, userData, unsaved } = value as Record<string, unknown>;
  if (
    !isSessionId(id) ||
    (slot !== null && slot !== 'a' && slot !== 'b') ||
    typeof userData !== 'boolean' ||
    typeof unsaved !== 'boolean'
  ) {
    return null;
  }
  return { id, slot, userData, unsaved };
}
