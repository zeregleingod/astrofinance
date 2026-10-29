import type { MatDialog } from '@angular/material/dialog';
import type { BackupFailure, BackupNotice, ExportBlock } from '@domain/backup/backup-outcome';
import { ConfirmDialog, type ConfirmDialogData } from '@ui/confirm-dialog/confirm-dialog';
import { TEXTS } from '@ui/texts';
import { firstValueFrom } from 'rxjs';

const t = TEXTS.backup;

/** El texto de una tarea de copia terminada bien. */
export function backupNoticeText(notice: BackupNotice): string {
  return notice.task === 'exportando'
    ? `${t.exported} ${notice.fileName}`
    : `${t.restored} ${notice.fileName}. ${t.restoredTransactions} ${notice.transactions}.`;
}

/** El texto de una tarea de copia que ha fallado. */
export function backupFailureText(failure: BackupFailure): string {
  return failure.task === 'exportando' ? t.exportError : `${t.errors[failure.code]} ${t.unchanged}`;
}

/** Por qué no se puede descargar una copia. */
export function exportBlockText(block: ExportBlock): string {
  return block === 'demo' ? t.exportDemo : t.exportEmpty;
}

/** Cargar una copia descarta lo que haya: se pregunta antes. `true` si el usuario confirma. */
export async function confirmBackupReplace(dialog: MatDialog, fileName: string): Promise<boolean> {
  const data: ConfirmDialogData = {
    title: t.replaceQuestion,
    lines: [`${t.replaceConsequence} «${fileName}».`, t.replaceIrreversible],
    confirm: t.replaceConfirm,
    cancel: t.replaceCancel,
  };
  const confirmed = await firstValueFrom(
    dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        role: 'alertdialog',
        maxWidth: '480px',
      })
      .afterClosed(),
  );
  return confirmed === true;
}
