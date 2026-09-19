"use client";

export function Drawer({
  label,
  meta,
  metaClassName = "text-fg-muted",
  open,
  onToggle,
  children,
}: {
  label: string;
  meta?: React.ReactNode;
  metaClassName?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex shrink-0 cursor-pointer items-center gap-[10px] rounded-[16px] border border-edge bg-panel px-[14px] py-[12px] text-fg transition-colors hover:border-edge-warm"
      >
        <span className="min-w-0 flex-1 text-left text-[11px] font-bold tracking-[0.12em] text-fg-dim uppercase">
          {label}
        </span>
        {meta != null && <span className={`font-mono text-[11px] ${metaClassName}`}>{meta}</span>}
        <span className="font-mono text-[11px] text-fg-dim">{open ? "－" : "＋"}</span>
      </button>
      {open && children}
    </>
  );
}
