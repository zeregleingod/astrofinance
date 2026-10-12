import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';
import { DbService } from '@data/db/db-service';
import { FileSaver } from '@data/files/file-saver';
import {
  BackupError,
  MAX_DATABASE_BYTES,
  backupErrorCode,
  backupFileName,
} from '@domain/backup/database-file';
import { ConfirmDialog, type ConfirmDialogData } from '@shared/confirm-dialog/confirm-dialog';
import { firstValueFrom } from 'rxjs';

interface Notice {
  readonly message: string;
  /** Tras cargar una copia se ofrece ir a ver los movimientos. */
  readonly restored: boolean;
}

const t = TEXTS.backup;

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
  private readonly saver = inject(FileSaver);
  private readonly dialog = inject(MatDialog);

  protected readonly busy = signal<'exportando' | 'cargando' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  /** Por qué no hay nada que descargar; `null` si se puede. */
  protected readonly nothingToExport = computed(() => {
    if (this.db.mode() === 'demo') return t.exportDemo;
    return this.db.hasUserData() ? null : t.exportEmpty;
  });

  protected async download(): Promise<void> {
    this.start('exportando');
    try {
      const name = backupFileName(today());
      const saved = await this.saver.save(
        { name, mimeType: 'application/vnd.sqlite3', extension: '.db', description: t.fileType },
        () => this.db.exportFile(),
      );
      if (saved) this.notice.set({ message: `${t.exported} ${name}`, restored: false });
    } catch {
      this.error.set(t.exportError);
    } finally {
      this.busy.set(null);
    }
  }

  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Permite volver a elegir el mismo fichero tras un error o una cancelación.
    input.value = '';
    if (!file) return;
    if (this.db.hasUserData() && !(await this.confirmReplace(file.name))) return;

    this.start('cargando');
    try {
      if (file.size > MAX_DATABASE_BYTES) throw new BackupError('fichero-demasiado-grande');
      const { transactions } = await this.db.restore(new Uint8Array(await file.arrayBuffer()));
      this.notice.set({
        message: `${t.restored} ${file.name}. ${t.restoredTransactions} ${transactions}.`,
        restored: true,
      });
    } catch (error) {
      this.error.set(`${t.errors[backupErrorCode(error) ?? 'desconocido']} ${t.unchanged}`);
    } finally {
      this.busy.set(null);
    }
  }

  private start(task: 'exportando' | 'cargando'): void {
    this.error.set(null);
    this.notice.set(null);
    this.busy.set(task);
  }

  /** Cargar una copia descarta lo que haya: si es algo del usuario, se le pregunta antes. */
  private async confirmReplace(fileName: string): Promise<boolean> {
    const data: ConfirmDialogData = {
      title: t.replaceQuestion,
      lines: [`${t.replaceConsequence} «${fileName}».`, t.replaceIrreversible],
      confirm: t.replaceConfirm,
      cancel: t.replaceCancel,
    };
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
          data,
          role: 'alertdialog',
          maxWidth: '480px',
        })
        .afterClosed(),
    );
    return confirmed === true;
  }
}

/** La fecha local de hoy, `AAAA-MM-DD`. */
function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
