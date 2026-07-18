"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Depth, Report } from "@/lib/floodwatch/types";

/**
 * Custom canvas heat layer. Unlike leaflet.heat (single global radius), each
 * report is stamped with a radius AND an intensity derived from its reported
 * water level: deeper water = larger, darker blob. Overlapping stamps
 * accumulate alpha, so more reports in one place also read darker. The
 * accumulated grayscale buffer is then colourised through the density palette.
 */

// Per-depth blob radius (px) + per-stamp intensity (alpha contribution).
const DEPTH_STYLE: Record<Depth, { radius: number; intensity: number }> = {
  Ankle: { radius: 20, intensity: 0.22 },
  Knee: { radius: 27, intensity: 0.3 },
  Waist: { radius: 35, intensity: 0.38 },
  Above: { radius: 46, intensity: 0.46 },
};
const DEFAULT_STYLE = { radius: 26, intensity: 0.3 }; // depth not reported
const BLUR = 15;

const GRADIENT: Record<number, string> = {
  0.2: "#a9d6f2",
  0.4: "#6fb4e6",
  0.6: "#2e82d3",
  0.8: "#12539e",
  1.0: "#07286a",
};

function styleFor(depth: Depth | null) {
  return (depth && DEPTH_STYLE[depth]) || DEFAULT_STYLE;
}

/** A soft feathered disc, rendered once per radius and re-stamped per report. */
function makeCircle(radius: number, blur: number) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const r2 = radius + blur;
  canvas.width = canvas.height = r2 * 2;
  // Draw the disc off-canvas and let its blurred shadow land on-canvas.
  ctx.shadowOffsetX = ctx.shadowOffsetY = r2 * 2;
  ctx.shadowBlur = blur;
  ctx.shadowColor = "black";
  ctx.beginPath();
  ctx.arc(-r2, -r2, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();
  return { canvas, r2 };
}

/** 256-entry RGB lookup table from the gradient stops (indexed by alpha). */
function buildGradientLUT(grad: Record<number, string>): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of Object.entries(grad)) {
    g.addColorStop(Number(stop), color);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 256);
  return ctx.getImageData(0, 0, 1, 256).data;
}

function colorize(pixels: Uint8ClampedArray, grad: Uint8ClampedArray) {
  for (let i = 0, len = pixels.length; i < len; i += 4) {
    const j = pixels[i + 3] * 4; // accumulated alpha → gradient index
    if (j) {
      pixels[i] = grad[j];
      pixels[i + 1] = grad[j + 1];
      pixels[i + 2] = grad[j + 2];
    }
  }
}

type Circle = { canvas: HTMLCanvasElement; r2: number };

class HeatCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private reports: Report[] = [];
  private circles: Record<string, Circle> = {};
  private grad: Uint8ClampedArray;
  private onReset = () => this.reset();

  constructor(private map: L.Map) {
    this.canvas = L.DomUtil.create(
      "canvas",
      "leaflet-heat-layer leaflet-layer leaflet-zoom-hide",
    ) as HTMLCanvasElement;
    const size = map.getSize();
    this.canvas.width = size.x;
    this.canvas.height = size.y;
    this.ctx = this.canvas.getContext("2d")!;
    map.getPanes().overlayPane.appendChild(this.canvas);

    for (const [key, s] of Object.entries(DEPTH_STYLE)) {
      this.circles[key] = makeCircle(s.radius, BLUR);
    }
    this.circles._default = makeCircle(DEFAULT_STYLE.radius, BLUR);
    this.grad = buildGradientLUT(GRADIENT);

    map.on("moveend", this.onReset);
    map.on("resize", this.onReset);
    this.reset();
  }

  setReports(reports: Report[]) {
    this.reports = reports;
    this.redraw();
  }

  destroy() {
    this.map.off("moveend", this.onReset);
    this.map.off("resize", this.onReset);
    this.canvas.remove();
  }

  private reset() {
    const topLeft = this.map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.canvas, topLeft);
    const size = this.map.getSize();
    if (this.canvas.width !== size.x) this.canvas.width = size.x;
    if (this.canvas.height !== size.y) this.canvas.height = size.y;
    this.redraw();
  }

  private redraw() {
    const size = this.map.getSize();
    // Canvas getImageData throws on a 0-size buffer; skip until laid out.
    if (size.x === 0 || size.y === 0) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, size.x, size.y);

    for (const r of this.reports) {
      const style = styleFor(r.depth);
      const circle =
        (r.depth && this.circles[r.depth]) || this.circles._default;
      const p = this.map.latLngToContainerPoint([r.lat, r.lng]);
      if (
        p.x < -circle.r2 ||
        p.x > size.x + circle.r2 ||
        p.y < -circle.r2 ||
        p.y > size.y + circle.r2
      ) {
        continue;
      }
      ctx.globalAlpha = style.intensity;
      ctx.drawImage(circle.canvas, p.x - circle.r2, p.y - circle.r2);
    }
    ctx.globalAlpha = 1;

    const img = ctx.getImageData(0, 0, size.x, size.y);
    colorize(img.data, this.grad);
    ctx.putImageData(img, 0, 0);
  }
}

export default function HeatLayer({ reports }: { reports: Report[] }) {
  const map = useMap();
  const layerRef = useRef<HeatCanvas | null>(null);

  useEffect(() => {
    if (!layerRef.current) layerRef.current = new HeatCanvas(map);
    layerRef.current.setReports(reports);
  }, [map, reports]);

  useEffect(() => {
    return () => {
      layerRef.current?.destroy();
      layerRef.current = null;
    };
  }, []);

  return null;
}
