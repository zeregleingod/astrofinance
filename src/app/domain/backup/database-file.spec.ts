import {
  BackupError,
  MAX_DATABASE_BYTES,
  backupErrorCode,
  backupFileName,
  checkDatabaseFile,
} from './database-file';

describe('checkDatabaseFile', () => {
  const header = [...'SQLite format 3'].map((char) => char.charCodeAt(0));
  const file = (size: number, start: readonly number[] = [...header, 0]) => {
    const bytes = new Uint8Array(size);
    bytes.set(start.slice(0, size));
    return bytes;
  };
  const code = (bytes: Uint8Array) => {
    try {
      checkDatabaseFile(bytes);
      return null;
    } catch (error) {
      return backupErrorCode(error);
    }
  };

  it('acepta un fichero con la cabecera de SQLite', () => {
    expect(code(file(4096))).toBeNull();
  });

  it('rechaza un fichero vacío', () => {
    expect(code(new Uint8Array())).toBe('fichero-vacio');
  });

  it('rechaza lo que no empieza por la cabecera de SQLite', () => {
    expect(code(file(4096, [0x50, 0x4b, 0x03, 0x04]))).toBe('no-es-sqlite');
    expect(code(file(4096, [...header, 0x20]))).toBe('no-es-sqlite');
    // Truncado antes de terminar la cabecera.
    expect(code(file(10))).toBe('no-es-sqlite');
  });

  it('rechaza un fichero demasiado grande para ser una copia', () => {
    expect(code(file(MAX_DATABASE_BYTES + 1))).toBe('fichero-demasiado-grande');
  });
});

describe('backupErrorCode', () => {
  it('reconoce el error aunque haya cruzado entre hilos', () => {
    const crossed = Object.assign(new Error('version-futura'), { name: 'BackupError' });
    expect(backupErrorCode(crossed)).toBe('version-futura');
    expect(backupErrorCode(new BackupError('esquema-ajeno'))).toBe('esquema-ajeno');
  });

  it('devuelve null con cualquier otro error', () => {
    expect(backupErrorCode(new Error('version-futura'))).toBeNull();
    expect(backupErrorCode(Object.assign(new Error('otro'), { name: 'BackupError' }))).toBeNull();
    expect(backupErrorCode('version-futura')).toBeNull();
  });
});

describe('backupFileName', () => {
  it('lleva la fecha del día', () => {
    expect(backupFileName('2026-10-12')).toBe('astrofinance-2026-10-12.db');
  });

  it('no admite otra cosa que una fecha', () => {
    expect(() => backupFileName('../../x')).toThrow(RangeError);
  });
});
