import {
  isRpcRequest,
  type RpcContract,
  type RpcEndpoint,
  type RpcErrorData,
  type RpcHandlers,
  type RpcResponse,
} from './protocol';

/** Atiende peticiones RPC en un worker. Devuelve una función para dejar de escuchar. */
export function serveRpc<C extends RpcContract<C>>(
  endpoint: RpcEndpoint,
  handlers: RpcHandlers<C>,
): () => void {
  const listener = (event: MessageEvent) => {
    if (isRpcRequest(event.data)) void handle(event.data.id, event.data.method, event.data.params);
  };

  async function handle(id: number, method: string, params: unknown) {
    let response: RpcResponse;
    try {
      if (!Object.hasOwn(handlers, method)) {
        throw Object.assign(new Error(`Método desconocido: ${method}`), {
          name: 'RpcUnknownMethod',
        });
      }
      // Cada manejador valida sus parámetros: llegan de otro hilo.
      const handler = handlers[method as keyof C] as (params: unknown) => unknown;
      response = { id, ok: true, result: await handler(params) };
    } catch (error) {
      response = { id, ok: false, error: toErrorData(error) };
    }
    endpoint.postMessage(response);
  }

  endpoint.addEventListener('message', listener);
  return () => endpoint.removeEventListener('message', listener);
}

function toErrorData(error: unknown): RpcErrorData {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'Error', message: String(error) };
}
