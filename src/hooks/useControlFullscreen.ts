import { useCallback, useEffect, useRef, useState } from 'react';
export function useControlFullscreen(onStop: () => void) {
  const ref = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const toggle = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    onStop();
    try {
      if (fullscreen) {
        if (document.fullscreenElement) await document.exitFullscreen();
        setFullscreen(false); setFallback(false); setMessage('');
      } else {
        setFullscreen(true);
        try {
          if (!ref.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
          await ref.current.requestFullscreen();
          setFallback(false); setMessage('');
        } catch {
          setFallback(true);
          setMessage('Fullscreen unavailable here — using screen-filling demo mode.');
        }
      }
    } finally { pending.current = false; }
  }, [fullscreen, onStop]);
  useEffect(() => {
    const change = () => { onStop(); if (!document.fullscreenElement) { setFullscreen(false); setFallback(false); } };
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, [onStop]);
  useEffect(() => {
    if (!fullscreen) return;
    const oldOverflow = document.body.style.overflow;
    const oldOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && fallback) void toggle(); };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.documentElement.style.overscrollBehavior = oldOverscroll;
      window.removeEventListener('keydown', escape);
    };
  }, [fullscreen, fallback, toggle]);
  return { ref, fullscreen, message, toggle };
}
