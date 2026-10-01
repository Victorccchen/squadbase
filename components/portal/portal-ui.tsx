type PhotoSlotProps = {
  label: string;
  hint?: string;
  dark?: boolean;
  className?: string;
};

export function PhotoSlot({ label, hint, dark = false, className }: PhotoSlotProps) {
  return (
    <div className={`club-ph ${dark ? "club-ph-dark" : ""} ${className ?? ""}`}>
      <div>
        <p className="club-ph-label">{label}</p>
        {hint ? <p className="club-ph-hint">{hint}</p> : null}
      </div>
    </div>
  );
}

export function PortalEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="club-eyebrow-bar" aria-hidden="true" />
      <span className="club-eyebrow text-xs font-bold text-club-scarlet">{children}</span>
    </div>
  );
}
