import type { ReactNode } from 'react';

/** Fire once on contact, without a synthetic click replay or stealing joystick focus. */
export default function TriggerButton({ onTrigger, disabled, className, children }: {
  onTrigger: () => void;
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  return <button disabled={disabled} className={className}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onTrigger();
    }}
    onClick={event => { if (!disabled && event.detail === 0) onTrigger(); }}>
    {children}
  </button>;
}
