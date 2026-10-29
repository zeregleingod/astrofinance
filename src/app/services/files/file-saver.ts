import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';

export interface FileToSave {
  readonly name: string;
  readonly mimeType: string;
  /** Con el punto: `.db`. */
  readonly extension: `.${string}`;
  /** Cómo se llama este tipo de fichero en el diálogo de guardado. */
  readonly description: string;
}

/** Lo que se usa de la File System Access API, que aún no está en los tipos del DOM. */
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable(): Promise<{
    write(data: Uint8Array<ArrayBuffer>): Promise<void>;
    close(): Promise<void>;
  }>;
}>;

/** Margen para que el navegador empiece la descarga antes de soltar el contenido. */
const REVOKE_AFTER_MS = 60_000;

/**
 * Guarda un fichero en el dispositivo (T2.12). Donde existe la File System Access API el
 * usuario elige dónde; en el resto (Firefox, Safari, móviles) es una descarga corriente.
 */
@Service()
export class FileSaver {
  private readonly document = inject(DOCUMENT);

  /**
   * `content` se pide después de elegir dónde guardar, para que el diálogo se abra mientras
   * dura el gesto del usuario. Devuelve `false` si el usuario cancela el diálogo.
   */
  async save(file: FileToSave, content: () => Promise<Uint8Array<ArrayBuffer>>): Promise<boolean> {
    const view = this.document.defaultView as
      (Window & typeof globalThis & { showSaveFilePicker?: SaveFilePicker }) | null;
    if (!view) throw new Error('No hay ventana en la que guardar el fichero.');

    if (view.showSaveFilePicker) {
      try {
        const handle = await view.showSaveFilePicker({
          suggestedName: file.name,
          types: [{ description: file.description, accept: { [file.mimeType]: [file.extension] } }],
        });
        const bytes = await content();
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return true;
      } catch (error) {
        if (isAbort(error)) return false;
        // Diálogo bloqueado o escritura denegada: se intenta como descarga.
      }
    }

    const url = view.URL.createObjectURL(new Blob([await content()], { type: file.mimeType }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.hidden = true;
    this.document.body.append(link);
    link.click();
    link.remove();
    view.setTimeout(() => view.URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    return true;
  }
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}
