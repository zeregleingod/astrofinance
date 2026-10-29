/**
 * Contrato del RPC entre hilo principal y workers (T2.2). Un contrato es un mapa
 * `método → { params, result }`; los valores viajan por clonado estructurado.
 */
export interface RpcMethodSpec {
  readonly params: unknown;
  readonly result: unknown;
}

export type RpcContract<C> = { readonly [K in keyof C]: RpcMethodSpec };

export interface RpcRequest {
  readonly id: number;
  readonly method: string;
  readonly params: unknown;
}

export interface RpcErrorData {
  readonly name: string;
  readonly message: string;
}

export type RpcResponse =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | { readonly id: number; readonly ok: false; readonly error: RpcErrorData };

/** Lo que tienen en común `Worker`, `DedicatedWorkerGlobalScope` y `MessagePort`. */
export interface RpcEndpoint {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export type RpcHandlers<C extends RpcContract<C>> = {
  readonly [K in keyof C]: (params: C[K]['params']) => C[K]['result'] | Promise<C[K]['result']>;
};

export function isRpcRequest(value: unknown): value is RpcRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<RpcRequest>).id === 'number' &&
    typeof (value as Partial<RpcRequest>).method === 'string'
  );
}

export function isRpcResponse(value: unknown): value is RpcResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<Record<'id' | 'ok' | 'error', unknown>>;
  if (typeof response.id !== 'number' || typeof response.ok !== 'boolean') return false;
  return response.ok || (typeof response.error === 'object' && response.error !== null);
}
