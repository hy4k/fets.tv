"use client";

import { DisplayBoard } from "@/components/display/DisplayBoard";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { useNow } from "@/lib/use-clock";
import { clockAt, fullName } from "@/lib/format";

export function TvPreviewScreen() {
  const { candidates, center, call, displays } = useConsole();
  const { open, toggle } = useDrawers("tv", { displays: false });
  const now = useNow();

  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;
  const showName = center.show_name_on_tv;

  const next = candidates
    .filter((c) => c.status === "waiting" && !c.called_at)
    .slice(0, 4)
    .map((c) => ({ token: c.public_token, name: showName ? fullName(c) : null }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      <DisplayBoard
        className="flex-1"
        hallLabel={displays[0]?.hall_label ?? "HALL 1"}
        timezone={center.timezone}
        nonce={call?.call_nonce ?? 0}
        siteLabel={`${center.site_code} · ${center.name.replace(/^FETS\s+/i, "").toUpperCase()}`}
        call={
          called
            ? {
                token: called.public_token,
                name: showName ? fullName(called) : null,
                room: call?.room_label ?? null,
                instruction: call?.instruction ?? null,
              }
            : null
        }
        next={next}
      />

      <Drawer
        label="Paired displays"
        meta={displays.length}
        open={open.displays}
        onToggle={toggle("displays")}
      >
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[10px]">
          {displays.map((d) => {
            const stale = !d.last_seen_at || now - new Date(d.last_seen_at).getTime() > 60_000;
            return (
              <div
                key={d.id}
                className="flex items-center gap-[10px] rounded-[14px] border border-edge bg-panel-soft p-[11px]"
              >
                <span className={`h-[7px] w-[7px] rounded-full ${stale ? "bg-rust" : "bg-mint"}`} />
                <span className="min-w-0 flex-1 overflow-hidden text-[12px] font-semibold text-ellipsis whitespace-nowrap">
                  {d.label}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">
                  {d.last_seen_at ? clockAt(d.last_seen_at, center.timezone) : "never"}
                </span>
              </div>
            );
          })}
          {displays.length === 0 && (
            <p className="font-mono text-[11px] text-fg-faint">
              No TV paired yet — add a row in public_displays with the hashed display key.
            </p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
