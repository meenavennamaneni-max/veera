import { useEffect, useState } from 'react';
import { Activity, Battery, Cpu, Clock, Thermometer, Zap } from 'lucide-react';
import type { ConnectionStatus } from '../types/robot';

interface StatusPanelProps {
  status: ConnectionStatus;
  isMoving: boolean;
  waveRequested: boolean;
  lastCommand: string;
  commandCount: number;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function StatusPanel({
  status,
  isMoving,
  waveRequested,
  lastCommand,
  commandCount,
}: StatusPanelProps) {
  const [uptime, setUptime] = useState(0);
  const isConnected = status === 'connected';

  useEffect(() => {
    if (!isConnected) {
      setUptime(0);
      return;
    }
    const timer = setInterval(() => {
      setUptime((v) => v + 1);

    }, 1000);
    return () => clearInterval(timer);
  }, [isConnected]);

  const metrics = [
    { label: 'BATTERY', Icon: Battery }, { label: 'CPU LOAD', Icon: Cpu }, { label: 'TEMP', Icon: Thermometer },
  ].map(metric => ({ ...metric, value: 'Not available', color: 'text-gray-500', bar: 0, barColor: 'bg-gray-700' }));

  const activities = [
    { label: 'MOVING', active: isMoving, color: 'text-yellow-400', dot: 'bg-yellow-400' },
    { label: 'WAVE REQUEST', active: waveRequested, color: 'text-orange-400', dot: 'bg-orange-400' },
  ];

  return (
    <div className="glass-panel rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-yellow-500/10 pb-3">
        <Activity size={16} className="text-yellow-400" />
        <span className="text-yellow-400 text-sm font-bold tracking-widest uppercase font-mono">
          Control Status
        </span>
        <div className={`ml-auto flex items-center gap-1.5 text-xs font-mono font-bold ${
          isConnected ? 'text-green-400' : 'text-gray-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-600'} ${isConnected ? 'animate-pulse' : ''}`} />
          {isConnected ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      {/* Activity indicators */}
      <div className="grid grid-cols-2 gap-2">
        {activities.map(({ label, active, color, dot }) => (
          <div
            key={label}
            className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all ${
              active && isConnected
                ? `bg-current/5 border-current/30 ${color}`
                : 'border-gray-700/50 bg-gray-800/20 text-gray-600'
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${active && isConnected ? dot : 'bg-gray-700'} ${active && isConnected ? 'animate-pulse' : ''}`} />
            <span className="text-xs font-mono font-bold">{label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500">Command activity, not hardware feedback. ESP32 telemetry is not provided.</p>
      {/* System metrics */}
      <div className="space-y-3">
        {metrics.map(({ label, value, Icon, color, bar, barColor }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Icon size={12} className={color} />
                <span className="text-xs text-gray-500 font-mono">{label}</span>
              </div>
              <span className={`text-xs font-bold font-mono ${color}`}>{value}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{
                  width: `${bar}%`,
                  boxShadow: bar > 0 ? `0 0 6px currentColor` : 'none',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Uptime & commands */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-black/30 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={11} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-mono">LINK TIME</span>
          </div>
          <div className="text-sm font-bold font-mono text-white">
            {isConnected ? formatUptime(uptime) : '--:--'}
          </div>
        </div>
        <div className="bg-black/30 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={11} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-mono">COMMANDS</span>
          </div>
          <div className="text-sm font-bold font-mono text-yellow-400">{commandCount}</div>
        </div>
      </div>

      {/* Last command */}
      <div className="bg-black/30 rounded-lg px-3 py-2">
        <div className="text-xs text-gray-500 font-mono mb-1">LAST WRITTEN COMMAND</div>
        <div className="text-sm font-bold font-mono text-white truncate">
          {lastCommand || 'None'}
        </div>
      </div>
    </div>
  );
}
