import { sha256Hex } from '@domain/crypto/sha256';
import { parseStatement } from '@domain/imports/bank-profiles';
import { StatementError } from '@domain/imports/bank-statement';
import { prepareImport } from '@domain/imports/imported-statement';
import type { RpcHandlers } from '../rpc/protocol';
import type { ImportApi } from './import-api';
import { readSheet } from './read-sheet';

const MAX_NAME = 255;

/** Implementación del contrato `ImportApi`: fichero → hoja → perfil bancario → extracto. */
export function createImportHandlers(): RpcHandlers<ImportApi> {
  return {
    readStatement(params) {
      const { name, bytes } = fileParam(params);
      return prepareImport(parseStatement(readSheet(bytes)), { name, sha256: sha256Hex(bytes) });
    },
  };
}

function fileParam(params: unknown): { name: string; bytes: Uint8Array } {
  const { name, bytes } = (params ?? {}) as { name?: unknown; bytes?: unknown };
  // Entre hilos (y entre contextos de test) `instanceof ArrayBuffer` no es fiable.
  if (Object.prototype.toString.call(bytes) !== '[object ArrayBuffer]') {
    throw new StatementError('fichero-ilegible');
  }
  // Solo el nombre, sin la ruta de quien lo exportó.
  const baseName = typeof name === 'string' ? (name.split(/[\\/]/).pop() ?? '').trim() : '';
  return {
    name: baseName.slice(0, MAX_NAME) || 'extracto',
    bytes: new Uint8Array(bytes as ArrayBuffer),
  };
}
