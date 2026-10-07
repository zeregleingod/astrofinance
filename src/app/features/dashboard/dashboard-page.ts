import { Component } from '@angular/core';
import { TEXTS } from '@core/i18n/texts';

@Component({
  selector: 'app-dashboard-page',
  template: `
    <h2>{{ texts.dashboard.title }}</h2>
    <p>{{ texts.dashboard.empty }}</p>
  `,
})
export class DashboardPage {
  protected readonly texts = TEXTS;
}
