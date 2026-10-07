import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatToolbarModule],
  template: `
    <mat-toolbar>
      <h1 class="app-title">{{ texts.app.name }}</h1>
    </mat-toolbar>
    <main>
      <router-outlet />
    </main>
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly texts = TEXTS;
}
