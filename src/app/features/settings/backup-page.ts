import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';
import { DbService } from '@data/db/db-service';
import { BackupService } from './backup-service';

/**
 * Configuración › Copia de seguridad (T2.11–T2.12, ADR-0010): descargar todos los datos en un
 * fichero `.db` y cargar uno descargado antes, que sustituye a los datos actuales.
 */
@Component({
  selector: 'app-backup-page',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  templateUrl: './backup-page.html',
  styleUrl: './backup-page.scss',
})
export class BackupPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly backup = inject(BackupService);

  protected readonly busy = this.backup.busy;
  protected readonly error = this.backup.error;
  protected readonly notice = this.backup.notice;
  protected readonly nothingToExport = this.backup.nothingToExport;

  constructor() {
    // Lo que se hiciera antes desde los accesos rápidos ya se anunció allí.
    this.backup.clearResult();
  }

  protected download(): Promise<boolean> {
    return this.backup.download();
  }

  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Permite volver a elegir el mismo fichero tras un error o una cancelación.
    input.value = '';
    if (file) await this.backup.restore(file);
  }
}
