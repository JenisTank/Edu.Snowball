// Placeholder bee mark — swap with official trademarked BumbleB Kidz logo asset when provided.
// Per brand spec: logo used as-is, never modified — this placeholder is only until real files arrive.
import { cn } from '../../lib/utils';

export function BeeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn('h-10 w-10', className)}>
      {/* wings */}
      <ellipse cx="24" cy="18" rx="10" ry="7" fill="#AEDFF7" opacity="0.85" transform="rotate(-25 24 18)" />
      <ellipse cx="40" cy="18" rx="10" ry="7" fill="#AEDFF7" opacity="0.85" transform="rotate(25 40 18)" />
      {/* body */}
      <ellipse cx="32" cy="38" rx="16" ry="18" fill="#F5D547" />
      {/* stripes */}
      <path d="M17.5 32 h29" stroke="#1F1B13" strokeWidth="5" strokeLinecap="round" />
      <path d="M17 41 h30" stroke="#1F1B13" strokeWidth="5" strokeLinecap="round" />
      <path d="M21.5 50 h21" stroke="#1F1B13" strokeWidth="5" strokeLinecap="round" />
      {/* face */}
      <circle cx="27" cy="25" r="1.8" fill="#1F1B13" />
      <circle cx="37" cy="25" r="1.8" fill="#1F1B13" />
      <path d="M28 28.5 q4 3 8 0" stroke="#1F1B13" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {/* antennae */}
      <path d="M27 17 q-2 -5 -5 -6" stroke="#1F1B13" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M37 17 q2 -5 5 -6" stroke="#1F1B13" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="21.5" cy="10.5" r="2" fill="#C8922A" />
      <circle cx="42.5" cy="10.5" r="2" fill="#C8922A" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BeeMark className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      {!compact && (
        <div className="leading-tight">
          <div className="font-heading font-900 text-lg font-extrabold tracking-tight">
            BumbleB <span className="text-honey-500">Kidz</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-body">ERP · Hive Control</div>
        </div>
      )}
    </div>
  );
}

// Honeycomb background pattern (SVG data-uri free)
export function Honeycomb({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden>
      {Array.from({ length: 6 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => {
          const x = col * 76 + (row % 2 ? 38 : 0);
          const y = row * 66;
          return (
            <path
              key={`${row}-${col}`}
              d={`M${x + 22} ${y} l22 0 l11 19 l-11 19 l-22 0 l-11 -19 z`}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.35"
            />
          );
        }),
      )}
    </svg>
  );
}
