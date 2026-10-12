import type { RpcEndpoint } from '@workers/rpc/protocol';

type Listener = (event: MessageEvent) => void;

export interface InProcessWorker extends RpcEndpoint {
  terminate(): void;
  readonly terminated: () => boolean;
}

/**
 * Solo para tests: el código real de un worker ejecutándose en el mismo hilo, con mensajes
 * asíncronos y clonado estructurado como entre hilos de verdad. `serve` recibe el extremo del
 * worker y registra en él sus manejadores.
 */
export function inProcessWorker(serve: (endpoint: RpcEndpoint) => void): InProcessWorker {
  const toWorker = new Set<Listener>();
  const toMain = new Set<Listener>();
  let terminated = false;
  const deliver = (listeners: Set<Listener>, message: unknown) =>
    setTimeout(() => {
      const event = new MessageEvent('message', { data: structuredClone(message) });
      listeners.forEach((l) => l(event));
    });

  serve({
    postMessage: (message) => deliver(toMain, message),
    addEventListener: (_type, listener) => toWorker.add(listener),
    removeEventListener: (_type, listener) => toWorker.delete(listener),
  });

  return {
    postMessage: (message) => deliver(toWorker, message),
    addEventListener: (_type, listener) => toMain.add(listener),
    removeEventListener: (_type, listener) => toMain.delete(listener),
    terminate: () => {
      terminated = true;
      toWorker.clear();
    },
    terminated: () => terminated,
  };
}
