import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { formatPrice } from "./api";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  value: number;
  className?: string;
}

// Animated numeric display — digits roll up from below on each value change.
// Static chars ($, commas, decimals) don't animate. Reduced-motion hard-swaps.
// Outer span is the themed root (e.g. .price). Visual layer is aria-hidden;
// an sr-only twin carries the live announcement for assistive tech.
export function AnimatedPrice({ value, className }: Props) {
  const visualRef = useRef<HTMLSpanElement | null>(null);
  const prevRef = useRef<number | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const formatted = formatPrice(value);

  useLayoutEffect(() => {
    const el = visualRef.current;
    if (!el) return;

    const isFirst = prevRef.current === null;
    const changed = !isFirst && prevRef.current !== value;
    prevRef.current = value;

    tweenRef.current?.kill();

    if (isFirst || !changed || prefersReducedMotion()) {
      el.textContent = formatted;
      return;
    }

    el.textContent = "";
    const digitSpans: HTMLElement[] = [];
    for (const ch of formatted) {
      const span = document.createElement("span");
      span.className = "animated-price__char";
      span.textContent = ch;
      el.appendChild(span);
      if (/\d/.test(ch)) digitSpans.push(span);
    }

    tweenRef.current = gsap.from(digitSpans, {
      yPercent: 110,
      opacity: 0,
      duration: 0.55,
      ease: "expo.out",
      stagger: 0.035,
      onComplete: () => {
        // Flatten DOM so the visual layer is simple text again —
        // next change re-splits from scratch.
        el.textContent = formatted;
      },
    });
  }, [value, formatted]);

  return (
    <span className={`animated-price${className ? ` ${className}` : ""}`}>
      <span ref={visualRef} className="animated-price__visual" aria-hidden="true" />
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {`Bitcoin price ${formatted}`}
      </span>
    </span>
  );
}
