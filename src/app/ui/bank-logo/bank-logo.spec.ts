import { bankLogoSrc } from './bank-logo';

describe('bankLogoSrc', () => {
  it('es la imagen del perfil de importación del banco', () => {
    expect(bankLogoSrc('Banc Sabadell')).toBe('banks/sabadell.webp');
  });

  it('un banco sin logotipo, o ninguno, no tiene imagen', () => {
    expect(bankLogoSrc('Banco Demo')).toBeNull();
    expect(bankLogoSrc(null)).toBeNull();
  });
});
