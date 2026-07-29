"use client";

import { useEffect, useState } from "react";
import type React from "react";

type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

export function FadeContent({
  children,
  className = "",
  delay = 0
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={cn("pickem-fade-content", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function MagicCard({
  children,
  className = "",
  active = false,
  as = "div",
  onSubmit
}: {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  as?: "div" | "article" | "section" | "form";
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const Component = as as React.ElementType;
  return (
    <Component
      onSubmit={as === "form" ? onSubmit : undefined}
      onPointerMove={(event: React.PointerEvent<HTMLElement>) => {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--x", `${event.clientX - rect.left}px`);
        target.style.setProperty("--y", `${event.clientY - rect.top}px`);
      }}
      className={cn(
        "pickem-magic-card rounded-md border border-ink/15 bg-white text-ink shadow-sm ring-1 ring-ink/5 transition duration-200 hover:-translate-y-0.5 hover:border-turf/25 hover:shadow-md dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/5 dark:hover:border-emerald-300/25",
        active && "border-gold/70 shadow-md ring-2 ring-gold/30 dark:border-gold/70 dark:ring-gold/25",
        className
      )}
    >
      {children}
    </Component>
  );
}

export function BorderBeam({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-80 [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude] p-px",
        "before:absolute before:inset-[-40%] before:animate-[pickem-border-beam_4s_linear_infinite] before:bg-[conic-gradient(from_90deg,transparent_0deg,transparent_70deg,rgba(214,166,68,0.85)_105deg,rgba(11,107,79,0.75)_145deg,transparent_190deg,transparent_360deg)]",
        className
      )}
    />
  );
}

export function ShimmerButton({
  children,
  className = "",
  disabled = false,
  type = "button",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "pickem-shimmer-button relative overflow-hidden rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:bg-ink/35 disabled:text-white/60 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-white/20 dark:disabled:text-zinc-500",
        className
      )}
      disabled={disabled}
      type={type}
      onClick={onClick}
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function NumberTicker({
  value,
  className = "",
  decimalPlaces = 0
}: {
  value: number;
  className?: string;
  decimalPlaces?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(value);
      return;
    }
    const start = displayValue;
    const delta = value - start;
    if (!delta) {
      return;
    }
    const startedAt = performance.now();
    const duration = 450;
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(start + delta * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{displayValue.toFixed(decimalPlaces)}</span>;
}
