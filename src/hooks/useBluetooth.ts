import { useState, useRef, useCallback, useEffect } from 'react';
import type { ConnectionStatus, LogEntry } from '../types/robot';
import type { CommandKind } from '../control/RobotController';
import { CommandQueue } from '../control/CommandQueue';

const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export function useBluetooth() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [commandCount, setCommandCount] = useState(0);
  const [lastCommand, setLastCommand] = useState('None');
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const queueRef = useRef<CommandQueue | null>(null);
  const ready = useRef(false);
  const connecting = useRef(false);
  const generation = useRef(0);
  const listenerRef = useRef<(() => void) | null>(null);
  const isBluetoothAvailable = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [{ id: crypto.randomUUID(), timestamp: new Date(), type, message }, ...prev.slice(0, 99)]);
  }, []);

  const cleanup = useCallback(() => {
    ready.current = false;
    queueRef.current?.close();
    queueRef.current = null;
    if (deviceRef.current && listenerRef.current) {
      deviceRef.current.removeEventListener('gattserverdisconnected', listenerRef.current);
    }
    listenerRef.current = null;
    deviceRef.current?.gatt?.disconnect();
    deviceRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (connecting.current || ready.current) return;
    if (!isBluetoothAvailable) {
      setError('Web Bluetooth requires Chrome/Edge on Android or a supported desktop, served over HTTPS.');
      return;
    }
    const attempt = ++generation.current;
    connecting.current = true;
    cleanup();
    setStatus('connecting');
    setError(null);
    const fail = (cause: unknown) => {
      if (attempt !== generation.current) return;
      cleanup();
      setStatus('error');
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      addLog('error', message);
    };
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'Veera Bot' }], optionalServices: [SERVICE_UUID],
      });
      if (attempt !== generation.current) return;
      deviceRef.current = device;
      const onDisconnect = () => fail(new Error('Robot disconnected. Motion cancelled; reconnect to begin a new gesture.'));
      listenerRef.current = onDisconnect;
      device.addEventListener('gattserverdisconnected', onDisconnect);
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
      if (attempt !== generation.current) { device.gatt?.disconnect(); return; }
      if (!characteristic.properties.write) throw new Error('ESP32 characteristic must support writes with response.');
      // Establish a safe state before enabling controls. This is a real GATT write, not a simulated connection.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          characteristic.writeValueWithResponse(new TextEncoder().encode('S')),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('ESP32 initial STOP timed out')), 1000); }),
        ]);
      } finally { clearTimeout(timeout); }
      if (attempt !== generation.current) { device.gatt?.disconnect(); return; }
      queueRef.current = new CommandQueue(async payload => {
        await characteristic.writeValueWithResponse(new TextEncoder().encode(payload));
        if (!ready.current) return;
        setLastCommand(payload.trim());
        setCommandCount(c => c + 1);
        // Keep the log readable; speed samples have their own live readout.
        if (!payload.startsWith('M:')) addLog('command', `Sent: ${payload.trim()}`);
      }, fail);
      ready.current = true;
      setStatus('connected');
      addLog('info', 'BLE connected; initial STOP written. Speed protocol and watchdog must be installed on ESP32.');
    } catch (cause) { fail(cause); }
    finally { if (attempt === generation.current) connecting.current = false; }
  }, [addLog, cleanup, isBluetoothAvailable]);

  const send = useCallback((payload: string, kind: CommandKind) => {
    if (!ready.current || !deviceRef.current?.gatt?.connected) return;
    queueRef.current?.send(payload, kind);
  }, []);
  const isConnected = useCallback(() => ready.current && !!deviceRef.current?.gatt?.connected, []);
  const disconnect = useCallback(async () => {
    ++generation.current;
    connecting.current = true;
    // Block new gestures, flush STOP after any in-flight GATT write, then disconnect.
    const queue = queueRef.current;
    queue?.send('S', 'stop');
    ready.current = false;
    setStatus('disconnected');
    await queue?.whenIdle();
    cleanup();
    connecting.current = false;
    setError(null);
    addLog('info', 'BLE disconnected. Firmware watchdog must enforce a hardware stop.');
  }, [cleanup, addLog]);

  useEffect(() => () => { ++generation.current; connecting.current = false; cleanup(); }, [cleanup]);
  return { status, error, logs, commandCount, lastCommand, isBluetoothAvailable,
    connect, disconnect, send, isConnected, clearLogs: () => setLogs([]) };
}
