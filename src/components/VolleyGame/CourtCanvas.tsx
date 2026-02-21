/**
 * Volleyball 2D — Court Canvas Renderer
 * Lightweight 2D side-view court with stick-figure players.
 */

import { useRef, useEffect, memo } from "react";
import type { MatchState } from "./types";

const W = 400;
const H = 240;
const GROUND = H - 40;
const NET_X = W / 2;
const NET_TOP = GROUND - 80;

interface Props {
  match: MatchState;
}

function drawCourt(ctx: CanvasRenderingContext2D) {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, "#87CEEB");
  sky.addColorStop(1, "#B0E0E6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);

  // Floor
  ctx.fillStyle = "#D2A56C";
  ctx.fillRect(0, GROUND, W, H - GROUND);

  // Court line
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, GROUND);
  ctx.lineTo(W - 16, GROUND);
  ctx.stroke();

  // Net
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(NET_X, NET_TOP);
  ctx.lineTo(NET_X, GROUND);
  ctx.stroke();

  // Net tape
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(NET_X - 12, NET_TOP - 2, 24, 4);

  // Net mesh
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 0.5;
  for (let y = NET_TOP + 8; y < GROUND; y += 8) {
    ctx.beginPath();
    ctx.moveTo(NET_X - 10, y);
    ctx.lineTo(NET_X + 10, y);
    ctx.stroke();
  }
}

function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  facingRight: boolean
) {
  const headR = 5;
  const bodyH = 16;
  const legH = 12;
  const headY = y - bodyH - legH - headR;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 8, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, headY + headR);
  ctx.lineTo(x, headY + headR + bodyH);
  ctx.stroke();

  // Arms
  const armDir = facingRight ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(x - 6, headY + headR + 5);
  ctx.lineTo(x + armDir * 8, headY + headR + 10);
  ctx.stroke();

  // Legs
  const legBase = headY + headR + bodyH;
  ctx.beginPath();
  ctx.moveTo(x, legBase);
  ctx.lineTo(x - 5, legBase + legH);
  ctx.moveTo(x, legBase);
  ctx.lineTo(x + 5, legBase + legH);
  ctx.stroke();

  // Label
  ctx.fillStyle = color;
  ctx.font = "bold 7px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 10);
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(x, GROUND - 1, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  const grad = ctx.createRadialGradient(x - 1, y - 1, 1, x, y, 6);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.5, "#FFD700");
  grad.addColorStop(1, "#DAA520");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();

  // Stripe
  ctx.strokeStyle = "rgba(200,50,50,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 4, -0.5, 1.2);
  ctx.stroke();
}

const CourtCanvas = memo(({ match }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    drawCourt(ctx);

    // Draw home team (left, blue)
    match.homeTeam.players.forEach((p) => {
      const px = p.x * (NET_X - 20) + 14;
      const py = GROUND - 10 + (p.y - 0.5) * 20;
      drawStickFigure(ctx, px, py, "#2563eb", p.label, true);
    });

    // Draw away team (right, red)
    match.awayTeam.players.forEach((p) => {
      const px = NET_X + 6 + (p.x - 0.5) * (NET_X - 20);
      const py = GROUND - 10 + (p.y - 0.5) * 20;
      drawStickFigure(ctx, px, py, "#dc2626", p.label, false);
    });

    // Ball
    const bx = match.ballX * W;
    const by = match.ballY * H;
    drawBall(ctx, bx, by);
  }, [match]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="w-full rounded-lg border border-border touch-none select-none"
      style={{ maxWidth: "100%", imageRendering: "auto" }}
    />
  );
});

CourtCanvas.displayName = "CourtCanvas";
export default CourtCanvas;
