import {
  ACCOUNT_BANKS,
  AccountError,
  accountError,
  accountErrorCode,
  cleanAccount,
  cleanAccountText,
} from './account';

describe('cuentas', () => {
  describe('bancos que se ofrecen', () => {
    it('son los que se saben importar, sin repetir y por orden alfabético', () => {
      expect(ACCOUNT_BANKS).toContain('Banc Sabadell');
      expect(ACCOUNT_BANKS).toContain('BBVA');
      expect(new Set(ACCOUNT_BANKS).size).toBe(ACCOUNT_BANKS.length);
      expect([...ACCOUNT_BANKS]).toEqual(
        [...ACCOUNT_BANKS].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      );
    });
  });

  describe('limpieza', () => {
    it('quita los espacios de los extremos y los repetidos', () => {
      expect(cleanAccountText('  Cuenta   nómina ')).toBe('Cuenta nómina');
    });

    it('limpia el nombre y el banco y conserva lo demás', () => {
      expect(cleanAccount({ id: 3, name: ' Hucha ', institution: ' BBVA  ' })).toEqual({
        id: 3,
        name: 'Hucha',
        institution: 'BBVA',
      });
    });
  });

  describe('validación', () => {
    const valid = { name: 'Cuenta nómina', institution: 'BBVA' };

    it('acepta una cuenta con nombre y banco', () => {
      expect(accountError(valid)).toBeNull();
    });

    it('exige un nombre de como mucho 80 caracteres', () => {
      expect(accountError({ ...valid, name: '   ' })).toBe('nombre-vacio');
      expect(accountError({ ...valid, name: 'x'.repeat(80) })).toBeNull();
      expect(accountError({ ...valid, name: 'x'.repeat(81) })).toBe('nombre-largo');
    });

    it('no admite dos cuentas con el mismo nombre, sin mirar mayúsculas, acentos ni espacios', () => {
      const others = [{ name: 'Cuenta Nómina' }];
      expect(accountError({ ...valid, name: 'cuenta  nomina' }, others)).toBe('nombre-repetido');
      expect(accountError({ ...valid, name: 'Cuenta ahorro' }, others)).toBeNull();
    });

    it('exige un banco de como mucho 80 caracteres', () => {
      expect(accountError({ ...valid, institution: ' ' })).toBe('banco-vacio');
      expect(accountError({ ...valid, institution: 'x'.repeat(81) })).toBe('banco-largo');
    });
  });

  describe('errores', () => {
    it('reconoce su código también si el error ha cruzado entre hilos', () => {
      expect(accountErrorCode(new AccountError('nombre-repetido'))).toBe('nombre-repetido');
      const crossed = Object.assign(new Error('cuenta-con-movimientos'), { name: 'AccountError' });
      expect(accountErrorCode(crossed)).toBe('cuenta-con-movimientos');
    });

    it('no confunde otros errores', () => {
      expect(accountErrorCode(new Error('nombre-vacio'))).toBeNull();
      expect(
        accountErrorCode(Object.assign(new Error('otro'), { name: 'AccountError' })),
      ).toBeNull();
      expect(accountErrorCode('nombre-vacio')).toBeNull();
    });
  });
});
