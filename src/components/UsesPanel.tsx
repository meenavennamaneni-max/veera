import { List, ChevronRight, X, Move, Hand, Radio, GraduationCap, MapPin, Settings } from 'lucide-react';

interface UsesPanelProps {
  onClose: () => void;
}

const capabilities = [
  { icon: Move, title: 'Precision driving', desc: 'Four motors, differential steering, smooth acceleration and immediate stop on joystick release.', color: 'border-yellow-500/30 bg-yellow-500/5', tag: 'DRIVE', tagColor: 'text-yellow-400' },
  { icon: Hand, title: 'Right-hand gestures', desc: 'A single robotic right hand for waves and interactive demonstrations, with a configurable cooldown.', color: 'border-orange-500/30 bg-orange-500/5', tag: 'HAND', tagColor: 'text-orange-400' },
  { icon: Radio, title: 'Mobile control', desc: 'Control Veera Bot from a compatible mobile device, tablet or computer over an ESP32 Bluetooth connection.', color: 'border-cyan-500/30 bg-cyan-500/5', tag: 'BLE', tagColor: 'text-cyan-400' },
  { icon: GraduationCap, title: 'Learning & discovery', desc: 'Bring robotics to life in schools, colleges, science fairs and robotics events through hands-on STEM demonstrations.', color: 'border-blue-500/30 bg-blue-500/5', tag: 'LEARN', tagColor: 'text-blue-400' },
  { icon: MapPin, title: 'Meet an audience', desc: 'Interactive experiences for exhibitions, museums, tourist places and public demonstrations.', color: 'border-purple-500/30 bg-purple-500/5', tag: 'DEMO', tagColor: 'text-purple-400' },
  { icon: Settings, title: 'Built for your project', desc: 'Veera Bot can be customized for different projects and educational or interactive environments, with compatible hardware and firmware.', color: 'border-green-500/30 bg-green-500/5', tag: 'CREATE', tagColor: 'text-green-400' },
];

export default function UsesPanel({ onClose }: UsesPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-panel-bright rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-yellow-500/30" style={{ boxShadow: '0 0 60px rgba(255,215,0,0.15), 0 0 120px rgba(255,215,0,0.05)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-yellow-500/20 shrink-0">
          <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <List size={20} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wider font-mono">ROBOT CAPABILITIES</h2>
            <p className="text-xs text-gray-500 font-mono">What VEERA BOT can do</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close uses"
            className="ml-auto p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all text-xl leading-none font-mono"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {capabilities.map((cap, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${cap.color} transition-all hover:scale-[1.01]`}
              >
                <div className="flex items-start gap-3">
                  <cap.icon size={24} className="shrink-0 text-yellow-400" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white text-sm">{cap.title}</h3>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-bold ${cap.tagColor}`}>
                        {cap.tag}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{cap.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Specs row */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'HEIGHT', value: '2 feet' },
              { label: 'CONTROLLER', value: 'ESP32' },
              { label: 'WIRELESS', value: 'BLE 4.2' },
              { label: 'POWER', value: 'Li-Ion' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-black/30 rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500 font-mono">{label}</div>
                <div className="text-sm font-bold text-yellow-400 font-mono mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-yellow-500/10 flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            onClick={onClose}
            aria-label="Close uses"
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
