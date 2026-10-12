import { TestBed } from '@angular/core/testing';
import { FileSaver, type FileToSave } from './file-saver';

describe('FileSaver', () => {
  const file: FileToSave = {
    name: 'copia.db',
    mimeType: 'application/vnd.sqlite3',
    extension: '.db',
    description: 'Copia',
  };
  const bytes = new Uint8Array([1, 2, 3]);
  const content = () => Promise.resolve(bytes);
  const picker = (value: unknown) => vi.stubGlobal('showSaveFilePicker', value);

  /** Sustituye la descarga del navegador y devuelve los enlaces que se han pulsado. */
  function captureDownloads() {
    const blobs: Blob[] = [];
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:copia';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    return { blobs, clicked };
  }

  beforeEach(() => {
    // jsdom no implementa las URL de objetos.
    URL.createObjectURL ??= () => '';
    URL.revokeObjectURL ??= () => undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sin diálogo de guardado, descarga el fichero con su nombre', async () => {
    picker(undefined);
    const { blobs, clicked } = captureDownloads();

    expect(await TestBed.inject(FileSaver).save(file, content)).toBe(true);

    expect(clicked).toEqual([{ href: 'blob:copia', download: 'copia.db' }]);
    expect(blobs[0]?.type).toBe('application/vnd.sqlite3');
    expect(blobs[0]?.size).toBe(3);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('con diálogo de guardado, escribe donde elija el usuario', async () => {
    const written: unknown[] = [];
    const close = vi.fn(() => Promise.resolve());
    const show = vi.fn(() =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: (data: unknown) => {
              written.push(data);
              return Promise.resolve();
            },
            close,
          }),
      }),
    );
    picker(show);
    const { clicked } = captureDownloads();

    expect(await TestBed.inject(FileSaver).save(file, content)).toBe(true);

    expect(show).toHaveBeenCalledWith({
      suggestedName: 'copia.db',
      types: [{ description: 'Copia', accept: { 'application/vnd.sqlite3': ['.db'] } }],
    });
    expect(written).toEqual([bytes]);
    expect(close).toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it('si el usuario cancela el diálogo no guarda nada ni pide el contenido', async () => {
    picker(() => Promise.reject(new DOMException('Cancelado', 'AbortError')));
    const { clicked } = captureDownloads();
    const produce = vi.fn(content);

    expect(await TestBed.inject(FileSaver).save(file, produce)).toBe(false);

    expect(produce).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it('si el diálogo falla por otra causa, recurre a la descarga', async () => {
    picker(() => Promise.reject(new DOMException('Bloqueado', 'SecurityError')));
    const { clicked } = captureDownloads();

    expect(await TestBed.inject(FileSaver).save(file, content)).toBe(true);

    expect(clicked).toHaveLength(1);
  });
});
