"use client";
import { startTransition, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * True once the element comes within `rootMargin` of the viewport. The switch
 * happens in an idle callback and a transition, so heavy content (charts)
 * renders off the page-load critical path.
 */
export function useNearViewport<T extends Element>(rootMargin = "300px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    // Each instance mounts in its own idle callback, so several charts coming into
    // view together render as separate tasks rather than one long one.
    const show = () => {
      const run = () => startTransition(() => setNear(true));
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 500 });
      else setTimeout(run, 0);
    };
    if (typeof IntersectionObserver === "undefined") return show();
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && show(), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, rootMargin]);
  return [ref, near] as const;
}

/** Renders `children` only when near the viewport; `fallback` (sized like the content) until then. */
export function InView({ children, fallback = null, className, style, rootMargin }: { children: ReactNode; fallback?: ReactNode; className?: string; style?: CSSProperties; rootMargin?: string }) {
  const [ref, near] = useNearViewport<HTMLDivElement>(rootMargin);
  return (
    <div ref={ref} className={className} style={style}>
      {near ? children : fallback}
    </div>
  );
}
