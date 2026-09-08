import { describe, it, expect, vi } from 'vitest';
import { RobotController, calculateMotorSpeeds, approach } from '../src/control/RobotController';
import { CommandQueue } from '../src/control/CommandQueue';

describe('differential drive', () => {
  it.each([
    [0, 1, 255, 255], [0, -1, -255, -255], [-1, 0, -255, 255], [1, 0, 255, -255],
    [0, 0, 0, 0], [.02, -.03, 0, 0], [1, 1, 255, 0], [-1, 1, 0, 255],
    [-1, -1, -255, 0], [1, -1, 0, -255], [NaN, 1, 0, 0],
  ])('mixes (%s,%s) to (%s,%s)', (x, y, left, right) => {
    expect(calculateMotorSpeeds(x, y)).toEqual({ left, right });
  });
  it('scales speed with joystick distance and bounds each output', () => {
    expect(calculateMotorSpeeds(0, .3).left).toBeLessThan(calculateMotorSpeeds(0, .6).left);
    for (let x = -2; x <= 2; x += .1) for (let y = -2; y <= 2; y += .1) {
      const speeds = calculateMotorSpeeds(x, y);
      expect(Math.abs(speeds.left)).toBeLessThanOrEqual(255);
      expect(Math.abs(speeds.right)).toBeLessThanOrEqual(255);
    }
  });
  it('reverses through zero', () => {
    expect(approach(5, -255, 15)).toBe(0);
    expect(approach(0, -255, 15)).toBe(-15);
  });
});

function setup() {
  let connected = true;
  let now = 0;
  const send = vi.fn();
  const controller = new RobotController({ send, isConnected: () => connected }, () => now);
  return { controller, send, disconnect: () => { connected = false; }, advance: (ms: number) => { now += ms; } };
}
describe('control safety', () => {
  it('ramps acceleration/deceleration but stops immediately without replay', () => {
    const { controller: c, send } = setup();
    c.setJoystick(0, 1); c.tick(); expect(c.current.left).toBe(15);
    c.tick(); expect(c.current.left).toBe(30);
    c.setJoystick(0, 0); c.tick(); expect(c.current.left).toBe(15);
    c.stopRobot(); expect(c.current).toEqual({ left: 0, right: 0 });
    expect(send).toHaveBeenLastCalledWith('S', 'stop');
    send.mockClear(); c.tick(); expect(send).not.toHaveBeenCalled();
  });
  it('emits speed heartbeats while held', () => {
    const { controller: c, send } = setup();
    c.setJoystick(-1, 0);
    for (let i = 0; i < 30; i++) c.tick();
    expect(send).toHaveBeenLastCalledWith('M:-255,255\n', 'motor');
    expect(send).toHaveBeenCalledTimes(30);
  });
  it('resets on connection loss and rejects disconnected input', () => {
    const { controller: c, send, disconnect } = setup();
    c.setJoystick(1, 0); c.tick(); disconnect(); c.tick();
    c.setJoystick(0, 1); expect(c.active).toBe(false); expect(c.current.left).toBe(0);
    send.mockClear(); c.tick(); expect(send).not.toHaveBeenCalled();
    expect(c.waveRightHand()).toBe(false);
  });
  it('only triggers a wave; cooldown never blocks global STOP', () => {
    const { controller: c, send, advance } = setup();
    expect(c.waveRightHand()).toBe(true);
    expect(send).toHaveBeenLastCalledWith('H:wave\n', 'hand');
    expect(c.waveRightHand()).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    c.stopRobot(); expect(c.waveRequested).toBe(false);
    expect(send).toHaveBeenLastCalledWith('S', 'stop');
    advance(500); expect(c.waveRightHand()).toBe(true);
    send.mockClear(); advance(3000); c.tick();
    expect(c.waveRequested).toBe(false);
    // Website never runs a servo sequence or sends an automatic hand-stop command.
    expect(send).not.toHaveBeenCalled();
  });
  it('triggers exactly one Introduction command, not motor stop or browser audio', () => {
    const { controller: c, send, advance } = setup();
    c.setJoystick(-1, 0); c.tick();
    const previous = { ...c.current };
    send.mockClear();
    expect(c.triggerIntroduction()).toBe(true);
    expect(send.mock.calls).toEqual([['I', 'action']]);
    expect(c.active).toBe(true); expect(c.current).toEqual(previous);
    advance(10000);
    c.tick(); expect(send.mock.calls.filter(([payload]) => payload === 'I')).toHaveLength(1);
  });
  it('rejects both triggers while disconnected', () => {
    const { controller: c, send, disconnect } = setup();
    disconnect();
    expect(c.triggerIntroduction()).toBe(false);
    expect(c.waveRightHand()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('wave trigger leaves differential driving independent', () => {
    const { controller: c, send } = setup();
    c.setJoystick(1, 0); c.tick();
    expect(c.waveRightHand()).toBe(true); c.tick();
    expect(c.current).toEqual({ left: 30, right: -30 });
    expect(send.mock.calls.filter(([payload]) => payload === 'H:wave\n')).toHaveLength(1);
  });
});

describe('serialized BLE queue', () => {
  it('coalesces motor samples, drops stale actions and prioritizes STOP', async () => {
    let release!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
    const queue = new CommandQueue(write, vi.fn());
    queue.send('M:10,10\n', 'motor');
    queue.send('M:20,20\n', 'motor'); queue.send('M:30,30\n', 'motor');
    queue.send('H:wave\n', 'hand'); queue.send('I', 'action');
    expect(write).toHaveBeenCalledTimes(1);
    queue.send('S', 'stop'); release(); await queue.whenIdle();
    expect(write.mock.calls.map(c => c[0])).toEqual(['M:10,10\n', 'S']);
  });
  it('preserves one-shot wave and intro triggers alongside coalesced motor samples', async () => {
    let release!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
    const queue = new CommandQueue(write, vi.fn());
    queue.send('M:10,10\n', 'motor'); queue.send('H:wave\n', 'hand');
    queue.send('M:20,20\n', 'motor'); queue.send('I', 'action');
    queue.send('M:30,30\n', 'motor');
    release(); await queue.whenIdle();
    expect(write.mock.calls.map(c => c[0])).toEqual(['M:10,10\n', 'H:wave\n', 'I', 'M:30,30\n']);
  });
  it('closes and clears commands after a failed write', async () => {
    const error = new Error('disconnected'); const fail = vi.fn();
    const write = vi.fn().mockRejectedValue(error);
    const queue = new CommandQueue(write, fail);
    queue.send('M:20,20\n', 'motor'); queue.send('M:30,30\n', 'motor');
    await queue.whenIdle(); queue.send('M:40,40\n', 'motor');
    expect(fail).toHaveBeenCalledWith(error); expect(write).toHaveBeenCalledTimes(1);
  });
  it('times out stalled BLE writes rather than accumulating stale motion', async () => {
    vi.useFakeTimers();
    const fail = vi.fn();
    const queue = new CommandQueue(() => new Promise(() => {}), fail);
    queue.send('M:10,10\n', 'motor'); queue.send('S', 'stop');
    await vi.advanceTimersByTimeAsync(301);
    expect(fail).toHaveBeenCalledOnce(); await queue.whenIdle();
    vi.useRealTimers();
  });
});
