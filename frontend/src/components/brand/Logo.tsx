/**
 * Brand mark.
 *
 * The official BumbleB Kidz lockup (`/logo.png`) is used **as supplied** — a
 * trademark must never be redrawn, recoloured or cropped, so this file renders
 * the asset rather than approximating it. The bee-only SVG below is kept for
 * the one place a photographic mark would be washed out: it is only ever used
 * where the real file cannot load.
 */
import { cn } from '../../lib/utils';

export function BeeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn('h-10 w-10', className)}>
      {/* wings */}
      <ellipse
        cx="24"
        cy="18"
        rx="10"
        ry="7"
        fill="#AEDFF7"
        opacity="0.85"
        transform="rotate(-25 24 18)"
      />
      <ellipse
        cx="40"
        cy="18"
        rx="10"
        ry="7"
        fill="#AEDFF7"
        opacity="0.85"
        transform="rotate(25 40 18)"
      />
      {/* body */}
      <ellipse cx="32" cy="38" rx="16" ry="18" fill="#F5D547" />
      {/* stripes */}
      <path d="M17.5 32 h29" stroke="#1F1B13" strokeWidth="5" strokeLinecap="round" />
      <path d="M17 41 h30" stroke="#1F1B13" strokeWidth="5" strokeLinecap="round" />
      <path d="M21.5 50 h21" stroke="#1F1B13" strokeWidth="5" strokeLinecap="round" />
      {/* face */}
      <circle cx="27" cy="25" r="1.8" fill="#1F1B13" />
      <circle cx="37" cy="25" r="1.8" fill="#1F1B13" />
      <path
        d="M28 28.5 q4 3 8 0"
        stroke="#1F1B13"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* antennae */}
      <path
        d="M27 17 q-2 -5 -5 -6"
        stroke="#1F1B13"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M37 17 q2 -5 5 -6"
        stroke="#1F1B13"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="21.5" cy="10.5" r="2" fill="#C8922A" />
      <circle cx="42.5" cy="10.5" r="2" fill="#C8922A" />
    </svg>
  );
}

/** The official lockup, untouched. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="BumbleB Kidz"
      className={cn('h-10 w-auto object-contain', className)}
      draggable={false}
    />
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  // The lockup already contains the wordmark, so the app only adds the product
  // line underneath — repeating "BumbleB Kidz" next to the logo reads as a bug.
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo className={compact ? 'h-8' : 'h-11'} />
      {!compact && (
        <div className="leading-tight">
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-body">
            ERP · Hive Control
          </div>
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
