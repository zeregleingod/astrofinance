import {
  isSessionFileName,
  isSessionId,
  otherSlot,
  parseSessionRecord,
  resumeFileNames,
  sessionFileName,
  sessionIdOf,
  type SessionRecord,
} from './tab-session';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('sesión de la pestaña (ADR-0031)', () => {
  it('reconoce los ids de sesión: UUID en minúsculas', () => {
    expect(isSessionId(ID)).toBe(true);
    expect(isSessionId(ID.toUpperCase())).toBe(false);
    expect(isSessionId('../otra')).toBe(false);
    expect(isSessionId(3)).toBe(false);
  });

  it('nombra las copias por sesión y ranura, y sabe de qué sesión es cada una', () => {
    expect(sessionFileName(ID, 'a')).toBe(`sesion-${ID}-a.db`);
    expect(sessionIdOf(sessionFileName(ID, 'b'))).toBe(ID);
    expect(sessionIdOf(`sesion-${ID}-c.db`)).toBeNull();
    expect(sessionIdOf('astrofinance.db')).toBeNull();
    expect(isSessionFileName(sessionFileName(ID, 'a'))).toBe(true);
    expect(isSessionFileName('../sesion.db')).toBe(false);
    expect(isSessionFileName(null)).toBe(false);
  });

  it('alterna las ranuras: la primera copia va a la «a»', () => {
    expect(otherSlot(null)).toBe('a');
    expect(otherSlot('a')).toBe('b');
    expect(otherSlot('b')).toBe('a');
  });

  it('retoma de la última copia y, si no vale, de la anterior', () => {
    const record: SessionRecord = { id: ID, slot: 'b', userData: true, unsaved: false };

    expect(resumeFileNames(record)).toEqual([sessionFileName(ID, 'b'), sessionFileName(ID, 'a')]);
    expect(resumeFileNames({ ...record, slot: null })).toEqual([]);
  });

  it('lee el registro guardado y descarta el que no vale', () => {
    const record: SessionRecord = { id: ID, slot: 'a', userData: true, unsaved: true };

    expect(parseSessionRecord(JSON.stringify(record))).toEqual(record);
    expect(parseSessionRecord(JSON.stringify({ ...record, slot: null }))).toEqual({
      ...record,
      slot: null,
    });
    expect(parseSessionRecord(null)).toBeNull();
    expect(parseSessionRecord('{')).toBeNull();
    expect(parseSessionRecord('3')).toBeNull();
    expect(parseSessionRecord(JSON.stringify({ ...record, id: 'x' }))).toBeNull();
    expect(parseSessionRecord(JSON.stringify({ ...record, slot: 'c' }))).toBeNull();
    expect(parseSessionRecord(JSON.stringify({ ...record, userData: 1 }))).toBeNull();
    expect(parseSessionRecord(JSON.stringify({ ...record, unsaved: 'no' }))).toBeNull();
  });
});
