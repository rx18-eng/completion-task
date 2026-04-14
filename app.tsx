import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isCoarsePointer = () =>
  window.matchMedia("(pointer: coarse), (hover: none)").matches;

function usePreloader() {
  useEffect(() => {
    const root = document.getElementById("preloader");
    const btc = document.getElementById("pre-btc");
    const word = document.getElementById("pre-word");
    const count = document.getElementById("pre-count");
    if (!root || !btc || !word || !count) return;

    word.innerHTML = "";
    const letters = Array.from("BITCOIN").map((char) => {
      const span = document.createElement("span");
      span.textContent = char;
      word.appendChild(span);
      return span;
    });

    if (prefersReducedMotion()) {
      count.textContent = "100%";
      gsap.set(root, { opacity: 0, delay: 0.2 });
      const t = window.setTimeout(() => root.remove(), 400);
      return () => window.clearTimeout(t);
    }

    gsap.set(letters, { yPercent: 110 });
    gsap.set(btc, { scale: 0.4, opacity: 0 });

    const counter = { n: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(root, {
          opacity: 0,
          duration: 0.55,
          ease: "power3.inOut",
          onComplete: () => root.remove(),
        });
      },
    });

    tl.to(btc, { scale: 1, opacity: 1, duration: 0.72, ease: "expo.out" })
      .to(
        letters,
        { yPercent: 0, duration: 0.6, stagger: 0.04, ease: "expo.out" },
        "-=0.32"
      )
      .to(
        counter,
        {
          n: 100,
          duration: 1.0,
          ease: "power2.inOut",
          onUpdate: () => {
            const v = Math.round(counter.n);
            count.textContent = String(v).padStart(3, "0") + "%";
          },
        },
        0.1
      );

    return () => {
      tl.kill();
    };
  }, []);
}

function useCustomCursor() {
  useEffect(() => {
    const el = document.getElementById("cursor");
    if (!el) return;

    if (isCoarsePointer()) {
      el.style.display = "none";
      return;
    }

    if (prefersReducedMotion()) {
      el.style.display = "none";
      return;
    }

    gsap.set(el, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const xTo = gsap.quickTo(el, "x", { duration: 0.38, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.38, ease: "power3.out" });

    const move = (e: MouseEvent) => {
      xTo(e.clientX);
      yTo(e.clientY);
    };

    const isInteractive = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      !!t.closest('button, a, [role="button"], [data-interactive]');

    const over = (e: MouseEvent) => {
      if (isInteractive(e.target)) el.classList.add("cursor--expand");
    };
    const out = (e: MouseEvent) => {
      if (isInteractive(e.target)) el.classList.remove("cursor--expand");
    };

    const hide = () => gsap.to(el, { opacity: 0, duration: 0.2 });
    const show = () => gsap.to(el, { opacity: 1, duration: 0.2 });

    window.addEventListener("mousemove", move);
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("mouseenter", show);

    return () => {
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("mouseleave", hide);
      document.removeEventListener("mouseenter", show);
    };
  }, []);
}

function App() {
  usePreloader();
  useCustomCursor();

  return (
    <div className="shell">
      <header className="shell__head">
        <span className="eyebrow">Bitcoin · USD</span>
        <span className="eyebrow">SoB · 2026</span>
      </header>

      <main className="stub">
        <h1 className="stub__title">Bitcoin</h1>
        <p className="stub__sub">Scaffolding — live price arrives in commit 3.</p>
      </main>

      <footer className="shell__foot">
        <span className="eyebrow">Data: CoinGecko</span>
        <span className="eyebrow">Chart: TradingView Lightweight Charts</span>
      </footer>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<App />);
