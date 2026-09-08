import type { RightHandAction } from '../types/robot';

export type MotorSpeeds = { left: number; right: number };
export type CommandKind = 'motor' | 'stop' | 'hand' | 'hand-stop' | 'action';
export interface RobotTransport {
  isConnected(): boolean;
  send(payload: string, kind: CommandKind): void;
}
export const ZERO: MotorSpeeds = { left: 0, right: 0 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** x: right positive; y: forward positive. Signed PWM drives both motors on each side. */
export function calculateMotorSpeeds(x: number, y: number): MotorSpeeds {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...ZERO };
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 0.08) return { ...ZERO };
  // Radial dead zone, rescaled for a continuous start, circular limit.
  const scale = (Math.min(1, magnitude) - 0.08) / 0.92 / magnitude;
  x *= scale;
  y *= scale;
  const left = y + x;
  const right = y - x;
  const divisor = Math.max(1, Math.abs(left), Math.abs(right));
  return { left: Math.round(left / divisor * 255), right: Math.round(right / divisor * 255) };
}

export function approach(current: number, target: number, step: number): number {
  // Cross zero before changing electrical direction.
  const next = current * target < 0 ? 0 : target;
  return current + clamp(next - current, -step, step);
}

/** Transport-independent controller. tick runs at 20 Hz; STOP never goes through ramping. */
export class RobotController {
  target = { ...ZERO };
  current = { ...ZERO };
  active = false;
  handActive = false;
  handCooldownMs = 500;
  private lastHandAt = -Infinity;
  private handStopAt = 0;
  constructor(private transport: RobotTransport, private now = () => performance.now()) {}

  setJoystick(x: number, y: number) {
    if (!this.transport.isConnected()) return;
    this.active = true;
    this.target = calculateMotorSpeeds(x, y);
  }

  tick(deltaMs = 50) {
    if (!this.transport.isConnected()) {
      this.reset();
      return;
    }
    if (this.handActive && this.now() >= this.handStopAt) this.stopRightHand();
    if (!this.active) return;
    const step = 300 * clamp(deltaMs, 0, 100) / 1000;
    this.current = {
      left: approach(this.current.left, this.target.left, step),
      right: approach(this.current.right, this.target.right, step),
    };
    // Heartbeat even while held still. Firmware must stop on heartbeat loss.
    this.sendMotorCommand(this.current.left, this.current.right);
  }

  sendMotorCommand(leftSpeed: number, rightSpeed: number) {
    const safe = (v: number) => Number.isFinite(v) ? Math.round(clamp(v, -255, 255)) : 0;
    this.transport.send(`M:${safe(leftSpeed)},${safe(rightSpeed)}\n`, 'motor');
  }

  stopRobot() {
    this.reset();
    // S is a global emergency stop: drive AND right hand. Never queued behind motion.
    this.transport.send('S', 'stop');
  }

  moveRightHand(action: RightHandAction): boolean {
    if (!this.transport.isConnected() || this.now() - this.lastHandAt < this.handCooldownMs) return false;
    this.lastHandAt = this.now();
    this.handActive = true;
    this.handStopAt = this.now() + 2000;
    this.transport.send(`H:${action}\n`, 'hand');
    return true;
  }

  stopRightHand() {
    this.handActive = false;
    this.transport.send('H:stop\n', 'hand-stop');
  }

  reset() {
    this.active = false;
    this.handActive = false;
    this.target = { ...ZERO };
    this.current = { ...ZERO };
  }
}
