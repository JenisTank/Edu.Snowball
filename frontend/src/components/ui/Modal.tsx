import { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, wide, xl }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`card relative z-10 w-full ${xl ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-lg font-extrabold">{title}</h3>
          <button className="btn-neo-icon p-1.5" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-stone-600">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-stone-500">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children, msg }: { children?: ReactNode; msg?: string }) {
  const content = children ?? msg;
  if (!content) return null;
  return <p className="mb-3 rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-semibold text-rose-600">{content}</p>;
}
