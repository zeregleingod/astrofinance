import { bankLogo } from '@domain/accounts/account';

/**
 * La imagen del logotipo de un banco, servida por la propia app (`public/banks/<id>.webp`,
 * ADR-0034), o `null` si no lo tiene (un banco que no se sabe importar, el de la demo).
 */
export function bankLogoSrc(institution: string | null): string | null {
  const id = bankLogo(institution);
  return id ? `banks/${id}.webp` : null;
}
