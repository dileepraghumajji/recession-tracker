/** TerminalK mark: a terminal window with a "K" formed by a bar and a chevron, plus a cursor block. */
export function Logo({ size = 22, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" />
        <path d="M7 6.5v11" stroke="var(--accent-fg)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M15.5 6.5 10 12l5.5 5.5" stroke="var(--accent-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="16.5" y="15.2" width="2.8" height="2.4" rx="0.6" fill="var(--accent-fg)" />
      </svg>
      {withWordmark && (
        <span className="font-mono text-[13px] font-semibold tracking-[-0.01em] text-ink">
          Terminal<span className="text-accent">K</span>
        </span>
      )}
    </span>
  );
}
