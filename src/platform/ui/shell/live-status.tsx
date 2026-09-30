"use client";
import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import type { NavDashboard } from "./nav-data";

type State = "idle" | "live" | "paused" | "offline" | "error" | "degraded";

interface Status {
  version: string;
  updatedAt: string | null;
  note: string | null;
  checkedAt: string;
}

export function relativeAge(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const DOT: Record<State, string> = { idle: "bg-muted", live: "bg-good", paused: "bg-muted", offline: "bg-warning", error: "bg-serious", degraded: "bg-warning" };
const WORD: Record<State, string> = { idle: "Connecting", live: "Live", paused: "Paused", offline: "Offline", error: "Update check failed", degraded: "Synthetic data" };

/**
 * "Last updated" indicator for the open dashboard. Polls /api/live/<id> every
 * `pollSeconds` while the tab is visible and online, and re-renders the page
 * (router.refresh, keeping client state) only when the data version changes.
 */
export function LiveStatus({ dashboards }: { dashboards: NavDashboard[] }) {
  const path = usePathname();
  const d = dashboards.find((x) => path === x.basePath || path.startsWith(x.basePath + "/"));
  return d?.pollSeconds ? <Poller key={d.id} id={d.id} pollSeconds={d.pollSeconds} /> : null;
}

function Poller({ id, pollSeconds }: { id: string; pollSeconds: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<State>("idle");
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState("");
  const version = useRef<string | null>(null);
  const lastCheck = useRef(0);
  const inflight = useRef(false);

  const check = useCallback(
    async (force = false) => {
      if (inflight.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return setState("offline");
      inflight.current = true;
      lastCheck.current = Date.now();
      try {
        const r = await fetch(`/api/live/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const s = (await r.json()) as Status;
        const changed = version.current !== null && s.version !== version.current;
        version.current = s.version;
        setStatus(s);
        setState("live");
        if (changed || force) {
          startTransition(() => router.refresh());
          if (changed) setAnnounce(`Data updated ${new Date().toLocaleTimeString()}`);
        }
      } catch {
        setState("error");
      } finally {
        inflight.current = false;
      }
    },
    [id, router],
  );

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return setState((s) => (s === "live" ? "paused" : s));
      if (Date.now() - lastCheck.current >= pollSeconds * 1000) void check();
    };
    void check();
    const t = window.setInterval(tick, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setState((s) => (s === "paused" ? "live" : s));
        tick();
      }
    };
    const onOnline = () => void check();
    const onOffline = () => setState("offline");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [check, pollSeconds]);

  const updated = status?.updatedAt ? relativeAge(status.updatedAt, now) : null;
  // The server reports a note when the data is degraded (e.g. a provider fallback to synthetic data).
  const shown: State = state === "live" && status?.note ? "degraded" : state;
  const title = [
    status?.updatedAt ? `Data last updated ${new Date(status.updatedAt).toLocaleString()}` : "Data update time not known yet",
    status ? `Checked ${new Date(status.checkedAt).toLocaleTimeString()} · every ${pollSeconds >= 60 ? `${pollSeconds / 60} min` : `${pollSeconds} s`} while this tab is open` : null,
    status?.note ?? null,
    "Click to check now",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <>
      <button
        type="button"
        onClick={() => void check(true)}
        title={title}
        aria-label={`${WORD[shown]}${status?.note ? ` (${status.note})` : ""}${updated ? `, data updated ${updated}` : ""}. Check for new data now.`}
        className="group flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-2xs text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <span className="relative flex size-2" aria-hidden>
          {shown === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-40 motion-reduce:hidden" />}
          <span className={cn("relative inline-flex size-2 rounded-full", DOT[shown])} />
        </span>
        <span className="tabular-nums">
          <span className="hidden sm:inline">{shown === "live" || shown === "idle" ? "Updated " : `${WORD[shown]} · `}</span>
          {updated ?? (state === "idle" ? "…" : "—")}
        </span>
        <RefreshCw className="hidden size-3 opacity-0 transition-opacity group-hover:opacity-100 sm:block" aria-hidden />
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
