import { ReactNode } from 'react';
import { Modal as SnowballModal } from '@snowball/ui/components';

/** Compatibility adapter: every ERP modal now uses the shared Snowball dialog. */
export function Modal({ title, onClose, children, wide, xl }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean;
}) {
  return <SnowballModal open onClose={onClose} title={String(title)} maxWidth={xl ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-lg'}>{children}</SnowballModal>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div><label className="mb-1 block text-xs font-bold text-[color:var(--txt2)]">{label}</label>{children}{hint && <p className="mt-1 text-[11px] text-[color:var(--txt3)]">{hint}</p>}</div>;
}
export function ErrorNote({ children, msg }: { children?: ReactNode; msg?: string }) {
  const content=children??msg;if(!content)return null;return <p className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--danger)]" style={{background:'color-mix(in srgb,var(--danger) 12%,transparent)'}}>{content}</p>;
}
