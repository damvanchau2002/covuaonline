"use client";
import { useEffect, useRef } from "react";

type Props = { durationMs?: number; onDone?: () => void };

export default function Fireworks({ durationMs = 2000, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    const colors = ["#ff4d4f", "#faad14", "#52c41a", "#40a9ff", "#9254de"];
    const particles: { x:number; y:number; vx:number; vy:number; life:number; color:string }[] = [];
    const rand = (min:number, max:number) => Math.random() * (max - min) + min;

    const burst = () => {
      const cx = rand(width*0.2, width*0.8);
      const cy = rand(height*0.2, height*0.6);
      for (let i=0;i<80;i++) {
        const angle = rand(0, Math.PI*2);
        const speed = rand(2, 6);
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(40, 80),
          color: colors[Math.floor(Math.random()*colors.length)]
        });
      }
    };

    let frame = 0;
    const tick = () => {
      ctx.clearRect(0,0,width,height);
      if (frame % 25 === 0) burst();
      for (let i=particles.length-1;i>=0;i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.life -= 1;
        if (p.life <= 0) { particles.splice(i,1); continue; }
        ctx.globalAlpha = Math.max(p.life/80, 0.2);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI*2);
        ctx.fill();
      }
      frame++;
      if (frame < durationMs / (1000/60)) {
        requestAnimationFrame(tick);
      }
    };
    tick();
    const t = setTimeout(() => { onDone?.(); }, durationMs);
    return () => { clearTimeout(t); };
  }, [durationMs, onDone]);

  return (
    <canvas ref={ref} className="absolute inset-0 w-full h-full" />
  );
}