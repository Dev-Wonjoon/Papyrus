import { useState } from "react";
import type { QueueTraffic } from "../api/dashboard";
import TimeSeriesChart from "../components/TimeSeriesChart";
import { formatChartTime, formatPercent, resourceLines } from "./operationalMetrics";
import type { ResourceSample } from "./operationalMetrics";

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

export default function TrafficCharts({ traffic, loading, error, samples, target, canReset, onReset }: {
  traffic: QueueTraffic | null;
  loading: boolean;
  error: string | null;
  samples: ResourceSample[];
  target: string;
  canReset: boolean;
  onReset: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showFullWindow, setShowFullWindow] = useState(false);
  if (traffic === null) {
    return <p className="mb-6 text-sm text-slate-600" role={error ? "alert" : "status"}>
      {error ?? (loading ? "로그 유입량을 조회하고 있습니다." : "유입량을 확인할 수 없습니다.")}
    </p>;
  }

  const end = traffic.window_end_ms;
  const step = traffic.bucket_ms;
  const available = traffic.counts.length;
  if (available === 0) return <p className="mb-6 text-sm text-slate-600">아직 집계된 유입량이 없습니다.</p>;

  const count = showFullWindow ? available : Math.min(available, Math.ceil(60_000 / step));
  const start = traffic.window_start_ms + (available - count) * step;
  const points = traffic.counts.slice(-count).map((count, index) => ({
    at: start + step * (index + .5),
    value: count * 1000 / step,
  }));
  const peak = points.reduce<(typeof points)[number] | undefined>(
    (best, point) => point.value > (best?.value ?? 0) ? point : best, undefined);
  const maximum = Math.max(4, Math.ceil((peak?.value ?? 0) / 4) * 4);
  const index = selected === null || selected < start || selected > end
    ? null
    : Math.min(points.length - 1, Math.floor((selected - start) / step));
  const inspected = index === null ? null : points[index];
  const activeTime = inspected?.at ?? null;
  const visibleSamples = samples.filter(({ at }) => at >= start && at <= end);
  const nearbySample = inspected ? visibleSamples.findLast((sample) => sample.at <= inspected.at + step / 2
    && sample.at >= inspected.at - 15_000) : null;
  const rate = points.at(-1)?.value ?? 0;
  const backlog = traffic.queued_count + traffic.processing_count + traffic.retry_wait_count;
  const status = error ? "조회 지연" : rate > 0 ? "유입 중" : backlog > 0 ? "입력 없음 · 대기열 처리 중" : "입력 없음";

  return (
    <section className="mb-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="traffic-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="traffic-heading" className="text-xl font-bold">중앙 서버 전체 로그 유입량</h3>
          <p className="mt-1 text-sm text-slate-600">
            최근 {showFullWindow ? "15분" : "1분"} · 완료된 {step / 1000}초 구간 · 건/초
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={showFullWindow}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 aria-pressed:bg-slate-100"
            onClick={() => { setShowFullWindow(!showFullWindow); setSelected(null); }}>
            15분 보기
          </button>
          <span className={error || backlog > 0 && rate === 0
            ? "rounded-lg bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900"
            : "rounded-lg bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900"}>{status}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm tabular-nums sm:grid-cols-3">
        <div><dt className="text-slate-600">최근 구간</dt><dd className="font-semibold">{number.format(rate)}건/초</dd></div>
        <div><dt className="text-slate-600">최고 유입률</dt><dd className="font-semibold">{peak
          ? number.format(peak.value) + "건/초 · " + formatChartTime(peak.at - step / 2) : "유입 없음"}</dd></div>
        <div><dt className="text-slate-600">저장 대기열</dt><dd className="font-semibold">{number.format(backlog)}건</dd>
          <dd className="text-xs text-slate-600">대기 {number.format(traffic.queued_count)} · 처리 중 {number.format(traffic.processing_count)} · 재시도 {number.format(traffic.retry_wait_count)}</dd></div>
      </dl>

      {error && <p role="alert" className="text-sm text-amber-900">{error} 마지막 집계를 표시합니다.</p>}

      <TimeSeriesChart start={start} end={end} maximum={maximum} unit="건/초"
        series={[{ label: "중앙 수신", color: "#1d4ed8", points }]}
        selected={activeTime} onSelect={setSelected} peak={peak} />

      <div className="border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="break-all font-semibold">{target} 자원 사용률 (%)</h3>
          {canReset && <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={onReset}>중앙 서버 추이</button>}
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {visibleSamples.length === 0 ? "이 시간 범위에 수집된 표본이 없습니다."
            : "이 페이지를 연 동안의 표본입니다. 수집이 끊긴 구간은 선이 비어 있습니다."}
        </p>
        <TimeSeriesChart start={start} end={end} maximum={100} unit="%"
          series={resourceLines.map((line) => ({ label: line.label, color: line.color,
            points: visibleSamples.map(({ at, metrics }) => {
              const value = line.value(metrics);
              return { at, value: value == null ? null : value * 100 };
            }),
          }))}
          selected={activeTime} onSelect={setSelected} />
      </div>

      <label className="block text-xs text-slate-600">
        시간 선택
        <input type="range" className="mt-1 block w-full accent-blue-700"
          min={0} max={points.length - 1} value={index ?? points.length - 1}
          aria-valuetext={formatChartTime((inspected ?? points.at(-1)!).at - step / 2)}
          onChange={(event) => setSelected(start + (Number(event.currentTarget.value) + .5) * step)} />
      </label>
      {inspected && <p className="text-sm text-slate-700 tabular-nums">
        <span className="font-semibold">{formatChartTime(inspected.at - step / 2)}</span>
        {" · 수신 " + number.format(inspected.value) + "건/초"}
        {nearbySample ? resourceLines.map((line) =>
          " · " + line.label + " " + formatPercent(line.value(nearbySample.metrics))) : " · 자원 표본 없음"}
      </p>}
    </section>
  );
}
