import { Bluetooth, BluetoothConnected, BluetoothOff, AlertCircle, RefreshCw, X } from 'lucide-react';
import type { ConnectionStatus } from '../types/robot';

interface BluetoothPanelProps {
  status: ConnectionStatus;
  error: string | null;
  isBluetoothAvailable: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

const statusConfig = {
  disconnected: {
    color: 'text-gray-400',
    bg: 'bg-gray-800/50',
    border: 'border-gray-600',
    dot: 'bg-red-500',
    label: 'DISCONNECTED',
    Icon: BluetoothOff,
  },
  connecting: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-900/20',
    border: 'border-yellow-600',
    dot: 'bg-yellow-400',
    label: 'CONNECTING...',
    Icon: Bluetooth,
  },
  connected: {
    color: 'text-green-400',
    bg: 'bg-green-900/20',
    border: 'border-green-600',
    dot: 'bg-green-400',
    label: 'CONNECTED',
    Icon: BluetoothConnected,
  },
  error: {
    color: 'text-red-400',
    bg: 'bg-red-900/20',
    border: 'border-red-700',
    dot: 'bg-red-500',
    label: 'DISCONNECTED',
    Icon: AlertCircle,
  },
};

export default function BluetoothPanel({
  status,
  error,
  isBluetoothAvailable,
  onConnect,
  onDisconnect,
}: BluetoothPanelProps) {
  const cfg = statusConfig[status];
  const { Icon } = cfg;
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-yellow-500/10 pb-3">
        <Bluetooth size={16} className="text-yellow-400" />
        <span className="text-yellow-400 text-sm font-bold tracking-widest uppercase font-mono">
          Bluetooth Link
        </span>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
        <div className="relative flex items-center justify-center">
          <div
            className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`}
            style={
              isConnected
                ? { boxShadow: '0 0 8px rgba(0,255,100,0.8)' }
                : isConnecting
                ? { boxShadow: '0 0 8px rgba(255,215,0,0.8)', animation: 'pulse 1s infinite' }
                : {}
            }
          />
          {isConnecting && (
            <div className="absolute w-4 h-4 rounded-full border border-yellow-400 opacity-60 animate-ping" />
          )}
        </div>
        <Icon size={16} className={cfg.color} />
        <span className={`text-xs font-bold tracking-widest font-mono ${cfg.color}`}>{cfg.label}</span>
        {isConnected && (
          <span className="ml-auto text-xs text-green-400 font-mono">VEERA BOT</span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-700/40 rounded-lg">
          <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300 font-mono leading-relaxed">{error}</p>
        </div>
      )}

      {/* No BT warning */}
      {!isBluetoothAvailable && (
        <div className="flex items-start gap-2 px-3 py-2 bg-orange-900/20 border border-orange-700/40 rounded-lg">
          <AlertCircle size={14} className="text-orange-400 mt-0.5 shrink-0" />
          <p className="text-xs text-orange-300 font-mono leading-relaxed">
            Web Bluetooth not supported. Use Chrome/Edge on desktop or Android.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        {!isConnected ? (
          <button
            onClick={onConnect}
            disabled={isConnecting || !isBluetoothAvailable}
            className={`col-span-2 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm tracking-wider transition-all btn-control
              ${isConnecting
                ? 'bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 cursor-not-allowed'
                : 'bg-yellow-500 hover:bg-yellow-400 text-black border border-yellow-400 glow-yellow-sm cursor-pointer'
              }`}
          >
            {isConnecting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                SCANNING...
              </>
            ) : (
              <>
                <Bluetooth size={16} />
                CONNECT ROBOT
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={onDisconnect}
              className="col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-xs tracking-wider bg-red-900/30 border border-red-700/40 text-red-400 hover:bg-red-800/40 transition-all btn-control cursor-pointer"
            >
              <X size={13} />
              DISCONNECT
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">BLE link status only. Firmware must support signed motor speeds and a 350 ms safety watchdog. Open in a browser tab if pairing is blocked inside a preview.</p>
      {/* BT Specs */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="bg-black/30 rounded px-2 py-1">
          <div className="text-gray-500">PROTOCOL</div>
          <div className="text-gray-300">BLE 4.2</div>
        </div>
        <div className="bg-black/30 rounded px-2 py-1">
          <div className="text-gray-500">DEVICE</div>
          <div className="text-gray-300">ESP32</div>
        </div>
        <div className="bg-black/30 rounded px-2 py-1">
          <div className="text-gray-500">SERVICE</div>
          <div className="text-gray-300">0xFFE0</div>
        </div>
        <div className="bg-black/30 rounded px-2 py-1">
          <div className="text-gray-500">CHAR</div>
          <div className="text-gray-300">0xFFE1</div>
        </div>
      </div>
    </div>
  );
}
