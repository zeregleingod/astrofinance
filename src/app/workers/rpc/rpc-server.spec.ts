import type { RpcEndpoint, RpcResponse } from './protocol';
import { serveRpc } from './rpc-server';

interface TestApi {
  double: { params: { n: number }; result: number };
  later: { params: undefined; result: string };
  fail: { params: undefined; result: never };
}

/** Extremo falso: `deliver` simula un mensaje entrante y `sent` recoge las respuestas. */
function fakeEndpoint() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const sent: RpcResponse[] = [];
  const endpoint: RpcEndpoint = {
    postMessage: (message) => sent.push(message as RpcResponse),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const deliver = async (data: unknown) => {
    listeners.forEach((l) => l(new MessageEvent('message', { data })));
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { endpoint, sent, deliver, listeners };
}

describe('serveRpc', () => {
  const handlers = {
    double: ({ n }: { n: number }) => n * 2,
    later: async () => 'hecho',
    fail: () => {
      throw new RangeError('fuera de rango');
    },
  };

  it('responde con el resultado de manejadores síncronos y asíncronos', async () => {
    const { endpoint, sent, deliver } = fakeEndpoint();
    serveRpc<TestApi>(endpoint, handlers);

    await deliver({ id: 1, method: 'double', params: { n: 21 } });
    await deliver({ id: 2, method: 'later', params: undefined });

    expect(sent).toEqual([
      { id: 1, ok: true, result: 42 },
      { id: 2, ok: true, result: 'hecho' },
    ]);
  });

  it('serializa los errores con nombre y mensaje', async () => {
    const { endpoint, sent, deliver } = fakeEndpoint();
    serveRpc<TestApi>(endpoint, handlers);

    await deliver({ id: 3, method: 'fail', params: undefined });

    expect(sent).toEqual([
      { id: 3, ok: false, error: { name: 'RangeError', message: 'fuera de rango' } },
    ]);
  });

  it('rechaza métodos desconocidos, también los heredados de Object', async () => {
    const { endpoint, sent, deliver } = fakeEndpoint();
    serveRpc<TestApi>(endpoint, handlers);

    await deliver({ id: 4, method: 'nope', params: undefined });
    await deliver({ id: 5, method: 'toString', params: undefined });

    expect(sent.map((r) => (r.ok ? 'ok' : r.error.name))).toEqual([
      'RpcUnknownMethod',
      'RpcUnknownMethod',
    ]);
  });

  it('ignora mensajes que no son peticiones y deja de escuchar al cerrarse', async () => {
    const { endpoint, sent, deliver, listeners } = fakeEndpoint();
    const stop = serveRpc<TestApi>(endpoint, handlers);

    await deliver('hola');
    await deliver({ id: 'x', method: 'double' });
    stop();

    expect(sent).toEqual([]);
    expect(listeners.size).toBe(0);
  });
});
