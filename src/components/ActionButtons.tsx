import { Hand, ArrowUp, ArrowDown, Square, Timer, HandMetal } from 'lucide-react';
import type { RightHandAction } from '../types/robot';

interface Props {
  isConnected: boolean;
  isHandMoving: boolean;
  cooldownMs: number;
  coolingDown: boolean;
  onCooldownChange: (ms: number) => void;
  onHandMovement: (action: RightHandAction) => void;
  onStopHand: () => void;
}
export default function ActionButtons({ isConnected, isHandMoving, cooldownMs, coolingDown, onCooldownChange, onHandMovement, onStopHand }: Props) {
  return <div className="glass-panel rounded-xl p-5 hand-panel">
    <div className="section-heading"><Hand size={18} /><h2>Right Hand Movement</h2></div>
    <p className="text-gray-400 text-sm hand-description">One robotic hand. Independent control.</p>
    <div className="hand-actions">
      {([{ action: 'wave', label: 'Wave', Icon: HandMetal }, { action: 'raise', label: 'Raise', Icon: ArrowUp }, { action: 'lower', label: 'Lower', Icon: ArrowDown }] as const).map(({ action, label, Icon }) =>
        <button key={action} disabled={!isConnected || coolingDown} className="hand-button btn-control"
          onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onHandMovement(action); }}
          onClick={e => { if (e.detail === 0) onHandMovement(action); }}><Icon size={22} />{label}</button>)}
      <button className="hand-button hand-stop btn-control" aria-label="Stop right hand"
        onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); onStopHand(); }}
        onClick={e => { if (e.detail === 0) onStopHand(); }}><Square size={19} />Stop hand</button>
    </div>
    <div className="hand-cooldown"><Timer size={15} /><label htmlFor="hand-delay">Cooldown</label><select id="hand-delay" value={cooldownMs} onChange={e => onCooldownChange(Number(e.target.value))}>
      <option value="200">200 ms</option><option value="500">500 ms</option><option value="1000">1 second</option><option value="2000">2 seconds</option>
    </select></div>
    <p role="status" className="hand-status">{!isConnected ? 'Waiting for connection' : coolingDown ? 'Cooldown — stop remains available' : isHandMoving ? 'Hand command active · auto-stop at 2s' : 'Ready for a gesture'}</p>
  </div>;
}
