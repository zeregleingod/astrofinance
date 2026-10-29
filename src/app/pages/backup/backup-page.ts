import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { BackupService } from '@services/backup/backup-service';
import { DbService } from '@services/db/db-service';
import {
  backupFailureText,
  backupNoticeText,
  confirmBackupReplace,
  exportBlockText,
} from '@ui/backup/backup-messages';
import { TEXTS } from '@ui/texts';

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
  private readonly dialog = inject(MatDialog);

  protected readonly busy = this.backup.busy;
  protected readonly error = computed(() => {
    const failure = this.backup.error();
    return failure && backupFailureText(failure);
  });
  protected readonly notice = computed(() => {
    const notice = this.backup.notice();
    return notice && { message: backupNoticeText(notice), restored: notice.task === 'cargando' };
  });
  protected readonly nothingToExport = computed(() => {
    const block = this.backup.nothingToExport();
    return block && exportBlockText(block);
  });

  constructor() {
    // Lo que se hiciera antes desde los accesos rápidos ya se anunció allí.
    this.backup.clearResult();
  }

  protected download(): Promise<boolean> {
    return this.backup.download(TEXTS.backup.fileType);
  }

  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Permite volver a elegir el mismo fichero tras un error o una cancelación.
    input.value = '';
    if (file) await this.backup.restore(file, (name) => confirmBackupReplace(this.dialog, name));
  }
}
