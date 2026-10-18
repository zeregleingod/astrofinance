import { Service, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
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

export interface BackupNotice {
  readonly message: string;
  /** Tras cargar una copia se ofrece ir a ver los movimientos. */
  readonly restored: boolean;
}

export type BackupTask = 'exportando' | 'cargando';

const t = TEXTS.backup;

/**
 * Descargar y cargar copias de seguridad (T2.11–T2.12, ADR-0010). Lo usan la página de
 * Configuración › Copia de seguridad y los accesos rápidos de la barra lateral, que comparten
 * así el estado: mientras hay una tarea en marcha no se puede empezar otra desde ningún sitio.
 */
@Service()
export class BackupService {
  private readonly db = inject(DbService);
  private readonly saver = inject(FileSaver);
  private readonly dialog = inject(MatDialog);

  private readonly busyState = signal<BackupTask | null>(null);
  private readonly errorState = signal<string | null>(null);
  private readonly noticeState = signal<BackupNotice | null>(null);

  readonly busy = this.busyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly notice = this.noticeState.asReadonly();

  /** Por qué no hay nada que descargar; `null` si se puede. */
  readonly nothingToExport = computed(() => {
    if (this.db.mode() === 'demo') return t.exportDemo;
    return this.db.hasUserData() ? null : t.exportEmpty;
  });

  /** Olvida el resultado de la última tarea (no la que esté en marcha). */
  clearResult(): void {
    this.errorState.set(null);
    this.noticeState.set(null);
  }

  /** Descarga una copia. Devuelve `false` si el usuario cancela el diálogo de guardado. */
  async download(): Promise<boolean> {
    this.start('exportando');
    try {
      const name = backupFileName(today());
      const saved = await this.saver.save(
        { name, mimeType: 'application/vnd.sqlite3', extension: '.db', description: t.fileType },
        () => this.db.exportFile(),
      );
      if (saved) this.noticeState.set({ message: `${t.exported} ${name}`, restored: false });
      return saved;
    } catch {
      this.errorState.set(t.exportError);
      return true;
    } finally {
      this.busyState.set(null);
    }
  }

  /**
   * Carga la copia elegida, que sustituye a los datos actuales. Si hay algo del usuario se le
   * pregunta antes; devuelve `false` si no confirma.
   */
  async restore(file: File): Promise<boolean> {
    if (this.db.hasUserData() && !(await this.confirmReplace(file.name))) return false;

    this.start('cargando');
    try {
      if (file.size > MAX_DATABASE_BYTES) throw new BackupError('fichero-demasiado-grande');
      const { transactions } = await this.db.restore(new Uint8Array(await file.arrayBuffer()));
      this.noticeState.set({
        message: `${t.restored} ${file.name}. ${t.restoredTransactions} ${transactions}.`,
        restored: true,
      });
    } catch (error) {
      this.errorState.set(`${t.errors[backupErrorCode(error) ?? 'desconocido']} ${t.unchanged}`);
    } finally {
      this.busyState.set(null);
    }
    return true;
  }

  private start(task: BackupTask): void {
    this.clearResult();
    this.busyState.set(task);
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
