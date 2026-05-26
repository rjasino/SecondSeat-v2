export type ConnectionState = 'disconnected' | 'connected';

let state: ConnectionState = 'disconnected';

export async function connect(_uri: string): Promise<void> {
  state = 'connected';
}

export function getState(): ConnectionState {
  return state;
}
