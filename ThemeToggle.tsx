import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useMagnetic } from "./hooks";

type Theme = "light" | "dark";

const THEME_META_COLORS: Record<Theme, string> = {
  light: "#fafafa",
  dark: "#0a0a0a",
};

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Quota exceeded or storage blocked — theme still applies to DOM
  }
  // Set both meta tags to the chosen theme's color so browser chrome
  // matches regardless of OS preference
  const color = THEME_META_COLORS[theme];
  document
    .querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')
    ?.setAttribute("content", color);
  document
    .querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
    ?.setAttribute("content", color);
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function readInitialTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  return attr === "dark" ? "dark" : "light";
}

async function toggleWithTransition(
  ref: React.RefObject<HTMLButtonElement | null>,
  nextTheme: Theme
): Promise<void> {
  if (
    !ref.current ||
    !document.startViewTransition ||
    prefersReducedMotion()
  ) {
    applyTheme(nextTheme);
    return;
  }

  const transition = document.startViewTransition(() => {
    flushSync(() => {
      applyTheme(nextTheme);
    });
  });

  await transition.ready;

  const { top, left, width, height } = ref.current.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const right = window.innerWidth - left;
  const bottom = window.innerHeight - top;
  const maxRadius = Math.hypot(Math.max(left, right), Math.max(top, bottom));

  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${maxRadius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: 500,
      easing: "ease-in-out",
      pseudoElement: "::view-transition-new(root)",
    }
  );
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      // Only follow system if user hasn't stored a preference
      try {
        if (localStorage.getItem("theme")) return;
      } catch {
        // Storage blocked — follow system
      }
      const system: Theme = e.matches ? "dark" : "light";
      applyTheme(system);
      setTheme(system);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(
    async (ref: React.RefObject<HTMLButtonElement | null>) => {
      const next: Theme = theme === "light" ? "dark" : "light";
      setTheme(next);
      await toggleWithTransition(ref, next);
    },
    [theme]
  );

  return { theme, toggle } as const;
}

function SunIcon() {
  return (
    <g className="theme-toggle__sun">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </g>
    </g>
  );
}

function MoonIcon() {
  return (
    <g className="theme-toggle__moon">
      <path
        d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
        fill="currentColor"
      />
    </g>
  );
}

export function ThemeToggle() {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref, 0.28);
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      ref={ref}
      className="theme-toggle"
      data-interactive
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => toggle(ref)}
    >
      <svg
        className="theme-toggle__icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <SunIcon />
        <MoonIcon />
      </svg>
    </button>
  );
}
