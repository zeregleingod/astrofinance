/// <reference lib="webworker" />
import type { ImportApi } from './import/import-api';
import { createImportHandlers } from './import/import-handlers';
import { serveRpc } from './rpc/rpc-server';

// Los ficheros bancarios se leen aquí (SheetJS), fuera del hilo principal y lejos de la BD.
serveRpc<ImportApi>(self, createImportHandlers());
