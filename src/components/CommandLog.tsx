import { Terminal, Trash2, ChevronDown, ArrowUpRight, ArrowDownLeft, CircleAlert, Info, type LucideIcon } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import type { LogEntry } from '../types/robot';

interface CommandLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

const typeStyles: Record<LogEntry['type'], { color: string; Icon: LucideIcon; bg: string }> = {
  command: { color: 'text-yellow-400', Icon: ArrowUpRight, bg: 'bg-yellow-500/5' },
  response: { color: 'text-green-400', Icon: ArrowDownLeft, bg: 'bg-green-500/5' },
  error: { color: 'text-red-400', Icon: CircleAlert, bg: 'bg-red-500/5' },
  info: { color: 'text-blue-400', Icon: Info, bg: 'bg-blue-500/5' },
};

export default function CommandLog({ logs, onClear }: CommandLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-yellow-500/10 pb-3">
        <Terminal size={16} className="text-yellow-400" />
        <span className="text-yellow-400 text-sm font-bold tracking-widest uppercase font-mono">
          Command Log
        </span>
        <span className="ml-2 text-xs text-gray-600 font-mono">{logs.length} entries</span>
        <div className="ml-auto flex items-center gap-2">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
              }}
              className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              <ChevronDown size={12} />
              Latest
            </button>
          )}
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-1 overflow-y-auto max-h-56 pr-1 min-h-0"
      >
        {logs.length === 0 ? (
          <div className="text-center py-6 text-gray-600 text-xs font-mono">
            No log entries yet
          </div>
        ) : (
          [...logs].reverse().map((entry) => {
            const style = typeStyles[entry.type];
            return (
              <div
                key={entry.id}
                className={`flex items-start gap-2 px-2.5 py-1.5 rounded text-xs font-mono ${style.bg} slide-in`}
              >
                <span className={`shrink-0 ${style.color} font-bold w-3 text-center`}><style.Icon size={13} /></span>
                <span className="text-gray-500 shrink-0 w-16">
                  {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`${style.color} break-words min-w-0`}>{entry.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
