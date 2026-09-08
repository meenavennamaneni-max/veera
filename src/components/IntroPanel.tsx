import { Bot, X, ChevronRight, Cpu, Radio, Ruler, Zap, Hand, Move, Palette, Volume2 } from 'lucide-react';

interface IntroPanelProps {
  onClose: () => void;
}

export const INTRO_TEXT = 'Hi, I am Veera Bot. I am developed by Devaansh, Johnson, and Abhiram.';

const specs = [
  { icon: Ruler, label: 'Height', value: '2 feet (61 cm)' },
  { icon: Cpu, label: 'Controller', value: 'ESP32 Dual-Core' },
  { icon: Radio, label: 'Wireless', value: 'Bluetooth BLE 4.2' },
  { icon: Zap, label: 'Power', value: 'Li-Ion Battery' },
  { icon: Volume2, label: 'Audio', value: 'Built-in Speaker' },
  { icon: Hand, label: 'Right hand', value: 'Servo-Actuated' },
  { icon: Move, label: 'Drive', value: '4-motor differential' },
  { icon: Palette, label: 'Design', value: 'Square Futuristic' },
];

export default function IntroPanel({ onClose }: IntroPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="glass-panel-bright rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-yellow-500/40"
        style={{ boxShadow: '0 0 80px rgba(255,215,0,0.2), 0 0 160px rgba(255,215,0,0.08)' }}
      >
        {/* Header */}
        <div className="relative overflow-hidden px-6 py-5 border-b border-yellow-500/20 shrink-0">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5 grid-bg pointer-events-none" />
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-yellow-500/10 blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-4">
            <div
              className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10"
              style={{ boxShadow: '0 0 20px rgba(255,215,0,0.2)' }}
            >
              <Bot size={28} className="text-yellow-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-wider font-mono">VEERA BOT</h2>
              <p className="text-sm text-yellow-400 font-mono font-bold tracking-widest">PERSONAL ROBOT ASSISTANT</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close introduction"
              className="ml-auto p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Intro text */}
          <div className="relative rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">
            <div className="absolute top-0 left-6 -translate-y-1/2 px-2 bg-[#0f0f1e] text-xs text-yellow-400 font-mono font-bold">
              INTRODUCTION MESSAGE
            </div>
            <div className="flex items-start gap-3 mt-1">
              <div className="p-1.5 rounded-lg bg-yellow-500/10 shrink-0 mt-0.5">
                <Radio size={14} className="text-yellow-400" />
              </div>
              <p className="text-sm text-gray-300 leading-relaxed font-mono">
                {INTRO_TEXT}
              </p>
            </div>
          </div>

          {/* Specs grid */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={14} className="text-yellow-400" />
              <span className="text-xs text-yellow-400 font-mono font-bold tracking-widest">TECHNICAL SPECIFICATIONS</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {specs.map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="bg-black/30 border border-gray-700/50 rounded-lg px-3 py-2.5 hover:border-yellow-500/20 transition-colors"
                >
                  <div className="text-lg mb-1"><Icon size={20} /></div>
                  <div className="text-xs text-gray-500 font-mono">{label}</div>
                  <div className="text-xs font-bold text-white font-mono mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Command reference */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-yellow-400 font-mono font-bold tracking-widest">ESP32 COMMAND REFERENCE</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {[
                { cmd: 'M:L,R', desc: 'Drive PWM' },
                { cmd: 'S', desc: 'Stop all' },
                { cmd: 'I', desc: 'Intro' },
                { cmd: 'U', desc: 'Uses' },
                { cmd: 'H:action', desc: 'Right hand' },
              ].map(({ cmd, desc }) => (
                <div
                  key={cmd}
                  className="flex flex-col items-center gap-1 bg-black/40 border border-gray-700/50 rounded-lg px-2 py-2"
                >
                  <span className="text-sm font-black font-mono text-yellow-400">{cmd}</span>
                  <span className="text-xs text-gray-500 font-mono">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-yellow-500/10 flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm tracking-wider border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-all btn-control"
          >
            CLOSE
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
