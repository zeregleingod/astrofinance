import type { RpcEndpoint, RpcRequest } from '@workers/rpc/protocol';
import { RpcClient, RpcError, RpcTimeoutError } from './rpc-client';

interface TestApi {
  echo: { params: string; result: string };
}

/** Extremo falso: `requests` recoge lo enviado y `reply` simula la respuesta del worker. */
function fakeWorker() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const requests: RpcRequest[] = [];
  const endpoint: RpcEndpoint = {
    postMessage: (message) => requests.push(message as RpcRequest),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const reply = (data: unknown) =>
    listeners.forEach((l) => l(new MessageEvent('message', { data })));
  return { endpoint, requests, reply, listeners };
}

describe('RpcClient', () => {
  afterEach(() => vi.useRealTimers());

  it('envía la petición y resuelve con el resultado', async () => {
    const { endpoint, requests, reply } = fakeWorker();
    const client = new RpcClient<TestApi>(endpoint);

    const result = client.call('echo', 'hola');
    expect(requests).toEqual([{ id: 1, method: 'echo', params: 'hola' }]);
    reply({ id: 1, ok: true, result: 'HOLA' });

    await expect(result).resolves.toBe('HOLA');
  });

  it('empareja respuestas desordenadas por su id e ignora ids desconocidos', async () => {
    const { endpoint, reply } = fakeWorker();
    const client = new RpcClient<TestApi>(endpoint);

    const first = client.call('echo', 'a');
    const second = client.call('echo', 'b');
    reply({ id: 99, ok: true, result: '?' });
    reply({ id: 2, ok: true, result: 'B' });
    reply({ id: 1, ok: true, result: 'A' });

    await expect(first).resolves.toBe('A');
    await expect(second).resolves.toBe('B');
  });

  it('rechaza con el error remoto', async () => {
    const { endpoint, reply } = fakeWorker();
    const client = new RpcClient<TestApi>(endpoint);

    const result = client.call('echo', 'x');
    reply({ id: 1, ok: false, error: { name: 'RangeError', message: 'malo' } });

    await expect(result).rejects.toThrow(RpcError);
    await expect(result).rejects.toMatchObject({ name: 'RangeError', message: 'malo' });
  });

  it('rechaza por tiempo de espera y descarta la respuesta tardía', async () => {
    vi.useFakeTimers();
    const { endpoint, reply } = fakeWorker();
    const client = new RpcClient<TestApi>(endpoint, 1000);

    const result = client.call('echo', 'x');
    vi.advanceTimersByTime(1000);
    await expect(result).rejects.toThrow(RpcTimeoutError);
    expect(() => reply({ id: 1, ok: true, result: 'tarde' })).not.toThrow();
  });

  it('se puede cancelar con un AbortSignal', async () => {
    const { endpoint, requests } = fakeWorker();
    const client = new RpcClient<TestApi>(endpoint);
    const controller = new AbortController();

    const result = client.call('echo', 'x', { signal: controller.signal });
    controller.abort(new Error('cancelada'));
    await expect(result).rejects.toThrow('cancelada');

    const aborted = AbortSignal.abort(new Error('ya cancelada'));
    await expect(client.call('echo', 'y', { signal: aborted })).rejects.toThrow('ya cancelada');
    expect(requests).toHaveLength(1);
  });

  it('al cerrarse rechaza lo pendiente y deja de escuchar', async () => {
    const { endpoint, listeners } = fakeWorker();
    const client = new RpcClient<TestApi>(endpoint);

    const result = client.call('echo', 'x');
    client.dispose();

    await expect(result).rejects.toThrow(/cerrado/);
    expect(listeners.size).toBe(0);
    await expect(client.call('echo', 'y')).rejects.toThrow(/cerrado/);
  });
});
