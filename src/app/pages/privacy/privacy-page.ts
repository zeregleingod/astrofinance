import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@ui/texts';

/**
 * La política de privacidad (ADR-0032), la misma que `PRIVACIDAD.md` en el repositorio. Se ve
 * dentro de la aplicación y también sin BD abierta, en el marco de las páginas públicas.
 */
@Component({
  selector: 'app-privacy-page',
  imports: [MatIconModule],
  templateUrl: './privacy-page.html',
  styleUrl: './privacy-page.scss',
})
export class PrivacyPage {
  protected readonly t = TEXTS.privacy;
}
