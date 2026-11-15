import { useEffect, useId, useRef } from "react";
import { formatChartTime } from "../pages/operationalMetrics";

export type ChartSeries = {
  label: string;
  color: string;
  points: { at: number; value: number | null }[];
};

const LEFT = 48;
const RIGHT = 14;

export default function TimeSeriesChart({ start, end, maximum, unit, series, selected, onSelect, peak }: {
  start: number;
  end: number;
  maximum: number;
  unit: string;
  series: ChartSeries[];
  selected: number | null;
  onSelect: (at: number | null) => void;
  peak?: { at: number; value: number };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useId();

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const target = element;
    function draw() {
      const context = target.getContext("2d");
      if (!context) return;
      const { width, height } = target.getBoundingClientRect();
      if (width <= LEFT + RIGHT || end <= start) return;
      const scale = window.devicePixelRatio || 1;
      target.width = Math.round(width * scale);
      target.height = Math.round(height * scale);
      context.scale(scale, scale);

      const top = 16;
      const bottom = height - 30;
      const span = width - LEFT - RIGHT;
      const x = (at: number) => LEFT + (at - start) * span / (end - start);
      const y = (value: number) => bottom - value * (bottom - top) / maximum;

      context.font = '11px system-ui, sans-serif';
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (const fraction of [0, .25, .5, .75, 1]) {
        const value = maximum * fraction;
        const line = y(value);
        context.strokeStyle = "#e2e8f0";
        context.beginPath();
        context.moveTo(LEFT, line);
        context.lineTo(width - RIGHT, line);
        context.stroke();
        context.fillStyle = "#475569";
        context.fillText(new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value), LEFT - 7, line);
      }
      context.textBaseline = "top";
      const ticks = width < 520 ? [0, .5, 1] : [0, .25, .5, .75, 1];
      ticks.forEach((part) => {
        context.textAlign = part === 0 ? "left" : part === 1 ? "right" : "center";
        context.fillText(formatChartTime(start + part * (end - start)), LEFT + part * span, bottom + 8);
      });

      context.save();
      context.beginPath();
      context.rect(LEFT - 1, top - 5, span + 2, bottom - top + 10);
      context.clip();
      for (const line of series) {
        context.strokeStyle = line.color;
        context.fillStyle = line.color;
        context.lineWidth = 2;
        context.beginPath();
        let previous: number | null = null;
        for (const point of line.points) {
          if (point.value === null) {
            previous = null;
            continue;
          }
          if (previous === null || point.at - previous > 15_000) {
            context.moveTo(x(point.at), y(point.value));
          } else {
            context.lineTo(x(point.at), y(point.value));
          }
          previous = point.at;
        }
        context.stroke();
        const visible = line.points.filter((point) => point.at >= start && point.at <= end && point.value !== null);
        if (visible.length <= 12) {
          for (const point of visible) {
            context.beginPath();
            context.arc(x(point.at), y(point.value ?? 0), 2.5, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
      if (peak) {
        context.fillStyle = "#1e40af";
        context.beginPath();
        context.arc(x(peak.at), y(peak.value), 4, 0, Math.PI * 2);
        context.fill();
      }
      if (selected !== null) {
        context.strokeStyle = "#64748b";
        context.lineWidth = 1;
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(x(selected), top);
        context.lineTo(x(selected), bottom);
        context.stroke();
      }
      context.restore();
    }
    const observer = new ResizeObserver(draw);
    observer.observe(target);
    draw();
    return () => observer.disconnect();
  }, [start, end, maximum, series, selected, peak]);

  return (
    <>
      <p id={labels} className="sr-only">{unit} 단위 시계열. 아래 시간 선택으로 각 시점의 값을 확인할 수 있습니다.</p>
      <canvas ref={canvas} role="img" aria-label={series.map((line) => line.label).join(", ")}
        aria-describedby={labels} className="block h-56 w-full"
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const rect = event.currentTarget.getBoundingClientRect();
          const part = Math.max(0, Math.min(1, (event.clientX - rect.left - LEFT) / (rect.width - LEFT - RIGHT)));
          onSelect(start + (end - start) * part);
        }}
        onPointerLeave={() => onSelect(null)} />
      {series.length > 1 && <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {series.map((line) => <li key={line.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4" style={{ backgroundColor: line.color }} />{line.label}
        </li>)}
      </ul>}
    </>
  );
}
