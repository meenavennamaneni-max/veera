import { useCallback, useEffect, useRef, useState } from 'react';
import { RobotController, type RobotTransport, ZERO } from '../control/RobotController';
import type { RightHandAction } from '../types/robot';

export function useRobotControl(transport: RobotTransport, connected: boolean) {
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const [controller] = useState(() => new RobotController({
    isConnected: () => transportRef.current.isConnected(),
    send: (payload, kind) => transportRef.current.send(payload, kind),
  }));
  const [speeds, setSpeeds] = useState(ZERO);
  const [handActive, setHandActive] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownMs, setCooldownMs] = useState(500);
  const [stopVersion, setStopVersion] = useState(0);
  const stopRobot = useCallback(() => {
    controller.stopRobot();
    setSpeeds({ ...ZERO });
    setHandActive(false);
    setStopVersion(v => v + 1);
  }, [controller]);

  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      // A stalled/suspended tab must not resume a held gesture.
      if (now - last > 250) stopRobot();
      controller.tick(now - last);
      last = now;
      setSpeeds({ ...controller.current });
      setHandActive(controller.handActive);
      setCooldownUntil(value => value && now >= value ? 0 : value);
    }, 50);
    return () => { clearInterval(timer); controller.stopRobot(); };
  }, [controller, stopRobot]);

  useEffect(() => { stopRobot(); }, [connected, stopRobot]);
  useEffect(() => {
    const hide = () => { if (document.hidden) stopRobot(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.code === 'Space' && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault(); stopRobot();
      }
    };
    window.addEventListener('blur', stopRobot);
    window.addEventListener('resize', stopRobot);
    window.addEventListener('pagehide', stopRobot);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', stopRobot);
      window.removeEventListener('resize', stopRobot);
      window.removeEventListener('pagehide', stopRobot);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [stopRobot]);

  return { speeds, handActive, cooldownUntil, cooldownMs, stopVersion, stopRobot,
    setJoystick: (x: number, y: number) => controller.setJoystick(x, y),
    moveRightHand: (action: RightHandAction) => {
      if (controller.moveRightHand(action)) {
        setHandActive(true);
        setCooldownUntil(performance.now() + controller.handCooldownMs);
      }
    },
    stopRightHand: () => { controller.stopRightHand(); setHandActive(false); },
    setCooldownMs: (ms: number) => {
      const safe = Math.max(200, Math.min(2000, Number.isFinite(ms) ? ms : 500));
      controller.handCooldownMs = safe;
      setCooldownMs(safe);
    },
  };
}
