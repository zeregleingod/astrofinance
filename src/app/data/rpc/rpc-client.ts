import {
  isRpcResponse,
  type RpcContract,
  type RpcEndpoint,
  type RpcRequest,
} from '@workers/rpc/protocol';

/** Error lanzado en el worker, con su nombre y mensaje originales. */
export class RpcError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export class RpcTimeoutError extends Error {
  override readonly name = 'RpcTimeoutError';
}

export interface RpcCallOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

interface Pending {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  cleanup(): void;
}

/** Cliente RPC tipado sobre un worker (T2.2): ids de petición, tiempo de espera y cancelación. */
export class RpcClient<C extends RpcContract<C>> {
  private nextId = 1;
  private disposed = false;
  private readonly pending = new Map<number, Pending>();

  private readonly onMessage = (event: MessageEvent) => {
    if (!isRpcResponse(event.data)) return;
    const response = event.data;
    const call = this.pending.get(response.id);
    if (!call) return;
    call.cleanup();
    if (response.ok) call.resolve(response.result);
    else call.reject(new RpcError(response.error.name, response.error.message));
  };

  constructor(
    private readonly endpoint: RpcEndpoint,
    private readonly defaultTimeoutMs = 10_000,
  ) {
    endpoint.addEventListener('message', this.onMessage);
  }

  call<K extends keyof C & string>(
    method: K,
    params: C[K]['params'],
    options: RpcCallOptions = {},
  ): Promise<C[K]['result']> {
    if (this.disposed) return Promise.reject(new Error('El canal con el worker está cerrado.'));
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(signal.reason);

    const id = this.nextId++;
    return new Promise<C[K]['result']>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new RpcTimeoutError(`Sin respuesta del worker a «${method}».`));
      }, options.timeoutMs ?? this.defaultTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(id);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, { resolve: (v) => resolve(v as C[K]['result']), reject, cleanup });
      this.endpoint.postMessage({ id, method, params } satisfies RpcRequest);
    });
  }

  /** Rechaza todo lo pendiente y deja de escuchar al worker. */
  dispose(): void {
    this.disposed = true;
    this.endpoint.removeEventListener('message', this.onMessage);
    for (const call of [...this.pending.values()]) {
      call.cleanup();
      call.reject(new Error('El canal con el worker está cerrado.'));
    }
  }
}
