import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move, Fingerprint } from 'lucide-react';
import type { MotorSpeeds } from '../control/RobotController';

interface Props {
  isConnected: boolean;
  onJoystick: (x: number, y: number) => void;
  onStop: () => void;
  stopVersion: number;
  speeds: MotorSpeeds;
}

export default function MovementControls({ isConnected, onJoystick, onStop, stopVersion, speeds }: Props) {
  const owner = useRef<number | null>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);
  const reset = () => {
    const id = owner.current;
    owner.current = null;
    if (id !== null && padRef.current?.hasPointerCapture(id)) padRef.current.releasePointerCapture(id);
    keys.current.clear();
    setPosition({ x: 0, y: 0 });
    setHeld(false);
  };
  useEffect(() => { reset(); }, [stopVersion, isConnected]);

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = -(event.clientY - rect.top - rect.height / 2) / radius;
    const scale = Math.max(1, Math.hypot(x, y));
    x /= scale; y /= scale;
    setPosition({ x, y });
    onJoystick(x, y);
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (owner.current !== event.pointerId) return;
    event.preventDefault();
    reset();
    onStop();
  };
  const updateKeys = () => {
    const x = Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft'));
    const y = Number(keys.current.has('ArrowUp')) - Number(keys.current.has('ArrowDown'));
    const scale = Math.max(1, Math.hypot(x, y));
    setHeld(true); setPosition({ x: x / scale, y: y / scale }); onJoystick(x / scale, y / scale);
  };

  return (
    <div className="glass-panel rounded-xl p-5 movement-panel panel-corners">
      <div className="section-heading"><Move size={17} /><h2>Joystick driving</h2><span className="heading-tag">4 MOTORS</span></div>
      <div className="joystick-wrap">
        <div ref={padRef} role="group" aria-label="Driving joystick" aria-describedby="joystick-help"
          aria-disabled={!isConnected} tabIndex={isConnected ? 0 : -1}
          className={`joystick ${held ? 'is-held' : ''} ${!isConnected ? 'is-disabled' : ''}`}
          onContextMenu={e => e.preventDefault()}
          onPointerDown={e => {
            e.preventDefault();
            if (!isConnected || owner.current !== null || keys.current.size || (e.pointerType === 'mouse' && e.button !== 0)) return;
            owner.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            setHeld(true); update(e);
          }}
          onPointerMove={e => {
            if (owner.current !== e.pointerId) return;
            e.preventDefault();
            if (e.pointerType === 'mouse' && e.buttons === 0) { release(e); return; }
            update(e);
          }}
          onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
          onKeyDown={e => {
            if (!e.key.startsWith('Arrow')) return;
            e.preventDefault();
            if (!isConnected || owner.current !== null) return;
            keys.current.add(e.key); updateKeys();
          }}
          onKeyUp={e => {
            if (!keys.current.has(e.key)) return;
            e.preventDefault(); keys.current.delete(e.key);
            if (!keys.current.size) { reset(); onStop(); } else updateKeys();
          }}
          onBlur={() => { if (keys.current.size) { reset(); onStop(); } }}>
          <div className="joystick-ring" /><div className="joystick-cross horizontal" /><div className="joystick-cross vertical" />
          <ArrowUp className="direction up" size={22} /><ArrowDown className="direction down" size={22} />
          <ArrowLeft className="direction left" size={22} /><ArrowRight className="direction right" size={22} />
          <div className="joystick-knob" style={{ left: `${50 + position.x * 34}%`, top: `${50 - position.y * 34}%` }}>
            <Fingerprint size={34} strokeWidth={1.3} />
          </div>
        </div>
      </div>
      <p id="joystick-help" className="joystick-help">{isConnected ? 'Drag to drive. Release to STOP.' : 'Connect Veera Bot to enable driving.'}<span>Focus + arrow keys also supported.</span></p>
      <div className="motor-readouts">
        {(['left', 'right'] as const).map(side => <div key={side}>
          <div className="flex justify-between gap-2"><span>{side.toUpperCase()} PAIR</span><strong data-testid={`${side}-speed`}>{Math.round(speeds[side])}</strong></div>
          <div className="motor-track"><i style={{ width: `${Math.abs(speeds[side]) / 255 * 100}%` }} /></div>
        </div>)}
      </div>
      <p className="readout-note">Commanded PWM · −255 to +255 · not measured telemetry</p>
    </div>
  );
}
