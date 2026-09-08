import { Hand, Timer } from 'lucide-react';
import TriggerButton from './TriggerButton';

interface Props {
  isConnected: boolean;
  waveRequested: boolean;
  cooldownMs: number;
  coolingDown: boolean;
  onCooldownChange: (ms: number) => void;
  onWaveHand: () => void;
}
export default function ActionButtons({ isConnected, waveRequested, cooldownMs, coolingDown, onCooldownChange, onWaveHand }: Props) {
  return <div className="glass-panel rounded-xl p-5 hand-panel">
    <div className="section-heading"><Hand size={18} /><h2>Right Hand Movement</h2></div>
    <p className="text-gray-400 text-sm hand-description">ESP32 controls the servo wave.</p>
    <div className="hand-actions">
      <TriggerButton disabled={!isConnected || coolingDown} className="hand-button btn-control" onTrigger={onWaveHand}>
        <Hand size={22} />Wave Hand
      </TriggerButton>
    </div>
    <div className="hand-cooldown"><Timer size={15} /><label htmlFor="hand-delay">Cooldown</label><select id="hand-delay" value={cooldownMs} onChange={e => onCooldownChange(Number(e.target.value))}>
      <option value="200">200 ms</option><option value="500">500 ms</option><option value="1000">1 second</option><option value="2000">2 seconds</option>
    </select></div>
    <p role="status" className="hand-status">{!isConnected ? 'Waiting for connection' : coolingDown ? 'Cooldown — emergency STOP remains available' : waveRequested ? 'Wave requested · no servo feedback' : 'Ready to request a wave'}</p>
  </div>;
}
