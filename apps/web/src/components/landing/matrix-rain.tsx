"use client";

import { useEffect, useRef } from "react";

export interface MatrixRainProps {
  readonly speed?: number;
  readonly density?: number;
  readonly color?: string;
}

export default function MatrixRain({
  speed = 0.6,
  density = 0.5,
  color = "#00E5FF",
}: MatrixRainProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const glyphs =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789";
    let columns = 0;
    let drops: number[] = [];
    let fontSize = 14;

    function resize(): void {
      if (canvas === null || ctx === null) {
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fontSize = Math.max(12, Math.floor(w / 110));
      columns = Math.max(1, Math.floor((w / fontSize) * density));
      drops = new Array<number>(columns).fill(0).map(() => Math.random() * -50);
    }

    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    function draw(): void {
      if (canvas === null || ctx === null) {
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.font = fontSize + "px var(--font-helvetica), monospace";
      ctx.textBaseline = "top";
      for (let i = 0; i < columns; i++) {
        const ch = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.globalAlpha = 0.95;
        ctx.fillText(ch, x, y);
        ctx.globalAlpha = 0.25;
        ctx.fillText(ch, x, y - fontSize);
        ctx.globalAlpha = 1;
        drops[i] += speed;
        if (drops[i] * fontSize > h && Math.random() > 0.975) {
          drops[i] = Math.random() * -10;
        }
      }
      raf = window.requestAnimationFrame(draw);
    }

    raf = window.requestAnimationFrame(draw);

    return (): void => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [color, density, speed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-30"
    />
  );
}
