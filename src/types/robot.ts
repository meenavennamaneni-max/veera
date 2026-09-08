export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'command' | 'response' | 'error' | 'info';
  message: string;
}
