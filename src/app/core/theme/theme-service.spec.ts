import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme-service';

describe('ThemeService', () => {
  let root: HTMLElement;

  function setup(options: { stored?: string; systemDark?: boolean } = {}) {
    if (options.stored !== undefined) {
      localStorage.setItem(THEME_STORAGE_KEY, options.stored);
    }
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: options.systemDark ?? false,
      media: query,
    }));
    const service = TestBed.inject(ThemeService);
    root = TestBed.inject(DOCUMENT).documentElement;
    return service;
  }

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sin preferencia guardada sigue el modo del sistema', () => {
    expect(setup({ systemDark: true }).mode()).toBe('dark');
    expect(root.classList).toContain('theme-dark');
  });

  it('la preferencia guardada prevalece sobre la del sistema', () => {
    const service = setup({ stored: 'light', systemDark: true });

    expect(service.mode()).toBe('light');
    expect(root.classList).toContain('theme-light');
  });

  it('ignora valores guardados no válidos', () => {
    expect(setup({ stored: 'rosa', systemDark: false }).mode()).toBe('light');
  });

  it('toggle cambia el modo en caliente, actualiza la clase y lo recuerda', () => {
    const service = setup({ systemDark: false });

    service.toggle();

    expect(service.mode()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(root.classList).toContain('theme-dark');
    expect(root.classList).not.toContain('theme-light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    service.toggle();

    expect(service.mode()).toBe('light');
    expect(root.classList).toContain('theme-light');
    expect(root.classList).not.toContain('theme-dark');
  });

  it('sigue funcionando si el almacenamiento no está disponible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const service = setup({ systemDark: true });

    service.toggle();

    expect(service.mode()).toBe('light');
  });
});
