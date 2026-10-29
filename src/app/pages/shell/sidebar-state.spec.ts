import { TestBed } from '@angular/core/testing';
import { SIDEBAR_STORAGE_KEY, SidebarState } from './sidebar-state';

describe('SidebarState', () => {
  afterEach(() => localStorage.removeItem(SIDEBAR_STORAGE_KEY));

  it('empieza desplegada y recuerda la elección', () => {
    const state = TestBed.inject(SidebarState);
    expect(state.collapsed()).toBe(false);

    state.toggle();
    expect(state.collapsed()).toBe(true);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('plegado');

    state.toggle();
    expect(state.collapsed()).toBe(false);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('desplegado');
  });

  it('arranca como se dejó', () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, 'plegado');
    expect(TestBed.inject(SidebarState).collapsed()).toBe(true);
  });

  it('si no se puede guardar, sigue funcionando en la sesión', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const state = TestBed.inject(SidebarState);
    state.toggle();
    expect(state.collapsed()).toBe(true);
    spy.mockRestore();
  });
});
