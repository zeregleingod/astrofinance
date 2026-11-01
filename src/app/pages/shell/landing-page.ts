import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { BackupFailure } from '@domain/backup/backup-outcome';
import { PreferenceButtons } from './preference-buttons';
import { BackupService } from '@services/backup/backup-service';
import { DbService } from '@services/db/db-service';
import { backupNoticeText } from '@ui/backup/backup-messages';
import { CentsPipe } from '@ui/format/cents-pipe';
import { PeriodLabelPipe } from '@ui/format/period-label-pipe';
import { TEXTS } from '@ui/texts';
import { DEMO_PREVIEW } from './demo-preview';
import { LandingGate, type LandingEntry } from './landing-gate';

/** Lo que dura a la vista el aviso de la copia cargada. */
const NOTICE_MS = 6000;

type LandingFailure =
  { readonly entry: 'demo' | 'vacia' } | Extract<BackupFailure, { task: 'cargando' }>;

/**
 * La primera pantalla (ADR-0029), mientras no hay BD abierta: se entra cargando el fichero `.db`
 * del usuario, con la demo o con una BD vacía. Al lado, el último mes de la demo dentro de la
 * órbita del logo enseña qué hace la aplicación.
 */
@Component({
  selector: 'app-landing-page',
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PreferenceButtons,
    CentsPipe,
    PeriodLabelPipe,
  ],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
})
export class LandingPage {
  protected readonly texts = TEXTS;
  protected readonly preview = DEMO_PREVIEW;
  /** El ancho de cada barra, respecto del bloque de más gasto. */
  protected readonly widest = Math.max(...DEMO_PREVIEW.groups.map((g) => -g.totalCents));
  private readonly gate = inject(LandingGate);
  private readonly db = inject(DbService);
  private readonly backup = inject(BackupService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly entering = this.gate.entering;
  private readonly failure = signal<LandingFailure | null>(null);
  /** Por qué no se ha podido entrar, en el idioma de cada momento. */
  protected readonly error = computed(() => {
    const failure = this.failure();
    if (!failure) return null;
    if ('code' in failure) return TEXTS.backup.errors[failure.code];
    return failure.entry === 'demo' ? TEXTS.demo.error : TEXTS.landing.openError;
  });

  protected async openFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Permite volver a elegir el mismo fichero tras un error.
    input.value = '';
    if (!file) return;
    await this.enter('archivo', async () => {
      // En la landing no hay datos del usuario que se puedan perder: no se pregunta.
      await this.backup.restore(file, () => Promise.resolve(true));
      const error = this.backup.error();
      const notice = this.backup.notice();
      this.backup.clearResult();
      if (error?.task === 'cargando') {
        // La BD vacía en la que se ha comprobado el fichero no se queda abierta.
        this.db.close();
        this.failure.set(error);
      } else if (notice) {
        this.snackBar
          .open(backupNoticeText(notice), TEXTS.backup.viewTransactions, { duration: NOTICE_MS })
          .onAction()
          .subscribe(() => void this.router.navigateByUrl('/movimientos'));
      }
    });
  }

  protected openDemo(): Promise<void> {
    return this.enter('demo', () => this.db.openDemo());
  }

  protected startEmpty(): Promise<void> {
    return this.enter('vacia', () => this.db.openLocal());
  }

  private async enter(entry: LandingEntry, open: () => Promise<void>): Promise<void> {
    this.failure.set(null);
    await this.gate.enter(entry, async () => {
      try {
        await open();
      } catch {
        if (entry !== 'archivo') this.failure.set({ entry });
      }
    });
  }
}
