import { useEffect, useRef, type ReactNode } from 'react';
export default function InfoDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog ref={ref} aria-label={label} className="info-dialog" onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}
