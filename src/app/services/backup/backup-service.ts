import { Service, computed, inject, signal } from '@angular/core';
import type {
  BackupFailure,
  BackupNotice,
  BackupTask,
  ExportBlock,
} from '@domain/backup/backup-outcome';
import {
  BackupError,
  MAX_DATABASE_BYTES,
  backupErrorCode,
  backupFileName,
} from '@domain/backup/database-file';
import { DbService } from '@services/db/db-service';
import { FileSaver } from '@services/files/file-saver';

/**
 * Descargar y cargar copias de seguridad (T2.11–T2.12, ADR-0010). Lo usan la página de
 * Configuración › Copia de seguridad y los accesos rápidos de la barra lateral, que comparten
 * así el estado: mientras hay una tarea en marcha no se puede empezar otra desde ningún sitio.
 * El resultado se guarda como datos; los textos y el diálogo de confirmación los pone la UI.
 */
@Service()
export class BackupService {
  private readonly db = inject(DbService);
  private readonly saver = inject(FileSaver);

  private readonly busyState = signal<BackupTask | null>(null);
  private readonly errorState = signal<BackupFailure | null>(null);
  private readonly noticeState = signal<BackupNotice | null>(null);

  readonly busy = this.busyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly notice = this.noticeState.asReadonly();

  /** Por qué no hay nada que descargar; `null` si se puede. */
  readonly nothingToExport = computed<ExportBlock | null>(() => {
    if (this.db.mode() === 'demo') return 'demo';
    return this.db.hasUserData() ? null : 'sin-datos';
  });

  /** Olvida el resultado de la última tarea (no la que esté en marcha). */
  clearResult(): void {
    this.errorState.set(null);
    this.noticeState.set(null);
  }

  /**
   * Descarga una copia; `fileDescription` es el tipo de fichero que muestra el diálogo de
   * guardado. Devuelve `false` si el usuario cancela ese diálogo.
   */
  async download(fileDescription: string): Promise<boolean> {
    this.start('exportando');
    try {
      const fileName = backupFileName(today());
      const saved = await this.saver.save(
        {
          name: fileName,
          mimeType: 'application/vnd.sqlite3',
          extension: '.db',
          description: fileDescription,
        },
        () => this.db.exportFile(),
      );
      if (saved) this.noticeState.set({ task: 'exportando', fileName });
      return saved;
    } catch {
      this.errorState.set({ task: 'exportando' });
      return true;
    } finally {
      this.busyState.set(null);
    }
  }

  /**
   * Carga la copia elegida, que sustituye a los datos actuales. Si hay algo del usuario se le
   * pregunta antes con `confirmReplace`; devuelve `false` si no confirma.
   */
  async restore(
    file: File,
    confirmReplace: (fileName: string) => Promise<boolean>,
  ): Promise<boolean> {
    if (this.db.hasUserData() && !(await confirmReplace(file.name))) return false;

    this.start('cargando');
    try {
      if (file.size > MAX_DATABASE_BYTES) throw new BackupError('fichero-demasiado-grande');
      const { transactions } = await this.db.restore(new Uint8Array(await file.arrayBuffer()));
      this.noticeState.set({ task: 'cargando', fileName: file.name, transactions });
    } catch (error) {
      this.errorState.set({ task: 'cargando', code: backupErrorCode(error) ?? 'desconocido' });
    } finally {
      this.busyState.set(null);
    }
    return true;
  }

  private start(task: BackupTask): void {
    this.clearResult();
    this.busyState.set(task);
  }
}

/** La fecha local de hoy, `AAAA-MM-DD`. */
function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
