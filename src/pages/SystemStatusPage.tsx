import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchSystemStatus } from "../api/system";
import type { SystemStatus } from "../api/system";
import AgentStatusPanel from "../components/AgentStatusPanel";
import { fetchAgentOverview } from "../api/agents";
import { fetchQueueTraffic } from "../api/dashboard";
import TrafficCharts from "./TrafficCharts";
import { agentKey, formatPercent, fraction, rememberSample } from "./operationalMetrics";
import type { ResourceSample } from "./operationalMetrics";
import { usePolling } from "../hooks/usePolling";

type MetricsStatus = SystemStatus["metrics_status"];

type MetricCardProps = {
  title: string;
  value: string;
  description?: string;
};

const statusLabels: Record<MetricsStatus, string> = {
  STARTING: "측정 준비 중",
  FRESH: "최신 표본",
  STALE: "오래된 표본",
};

// Tailwind가 감지할 수 있도록 완성된 클래스명을 사용한다.
const statusStyles: Record<MetricsStatus, string> = {
  STARTING: "bg-slate-100 text-slate-700 ring-slate-200",
  FRESH: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  STALE: "bg-amber-50 text-amber-800 ring-amber-200",
};

function formatMemory(value: number | null): string {
  return value === null
    ? "측정 불가"
    : `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function formatDuration(value: number | null): string {
  if (value === null) return "측정 불가";

  const seconds = Math.floor(value / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}시간 ${minutes}분 ${seconds % 60}초`;
}

function MetricCard({ title, value, description }: MetricCardProps) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <dt className="text-sm font-medium text-slate-600">{title}</dt>

      <dd className="mt-2">
        <span className="block text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>

        {description && <span className="mt-1 block text-xs leading-5 text-slate-600">
          {description}
        </span>}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: MetricsStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export default function SystemStatusPage({ onSelectRun, demoRunId, overviewMode, demo }: {
  onSelectRun: (runId: string) => void;
  demoRunId: string | null;
  overviewMode: boolean;
  demo: ReactNode;
}) {
  const [now, setNow] = useState(() => performance.now());
  const [centralHistory, setCentralHistory] = useState<ResourceSample[]>([]);
  const [agentHistory, setAgentHistory] = useState(() => new Map<string, ResourceSample[]>());
  const [selected, setSelected] = useState<{ key: string; name: string } | null>(null);

  const readCentral = useCallback(async (signal: AbortSignal) => {
    const status = await fetchSystemStatus(signal);
    const next = status.metrics_status === "FRESH" && status.sampled_at_ms !== null
      ? { at: status.sampled_at_ms, metrics: status } : null;
    if (!signal.aborted) {
      setCentralHistory((samples) => rememberSample(samples, next, status.server_time_ms));
    }
    return status;
  }, []);

  const readAgents = useCallback(async (signal: AbortSignal) => {
    const snapshot = await fetchAgentOverview(signal);
    if (!signal.aborted) {
      setAgentHistory((previous) => new Map(snapshot.agents.map((agent) => {
        const key = agentKey(agent);
        return [key, rememberSample(previous.get(key) ?? [], agent.status === "ONLINE"
          ? { at: agent.last_received_at_ms, metrics: agent.heartbeat } : null,
        agent.last_received_at_ms + agent.age_ms)];
      })));
    }
    return snapshot;
  }, []);

  const { data, error, isLoading, isFetching, receivedAt, refresh } = usePolling(readCentral);
  const traffic = usePolling(fetchQueueTraffic);
  const overview = usePolling(readAgents);

  const selectedSamples = selected ? agentHistory.get(selected.key) : undefined;

  // 조회 후에도 표본의 경과 시간을 갱신한다.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(performance.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // 서버의 표본 나이에 브라우저에서 경과한 시간을 더한다.
  const sampleAge =
    data !== null && data.sample_age_ms !== null && receivedAt !== null
      ? data.sample_age_ms + Math.max(0, now - receivedAt)
      : null;

  let freshness: MetricsStatus = "STARTING";

  if (data !== null && data.metrics_status !== "STARTING") {
    freshness =
      data.metrics_status === "STALE" ||
      (sampleAge !== null && sampleAge >= data.stale_after_ms)
        ? "STALE"
        : "FRESH";
  }

  const refreshing = isFetching || traffic.isFetching || overview.isFetching;
  const agentSnapshot = overview.data;
  const agentElapsed = overview.receivedAt === null ? 0 : Math.max(0, now - overview.receivedAt);
  const reporting = agentSnapshot?.agents.filter((agent) =>
    agent.status === "ONLINE" && agent.age_ms + agentElapsed < agentSnapshot.stale_after_ms).length;

  return (
    <>
      {!overviewMode && <header className="workspace-heading">
        <h1>시스템 상태</h1>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => { refresh(); traffic.refresh(); overview.refresh(); }}
          className="workspace-action disabled:cursor-wait disabled:opacity-50"
        >
          {refreshing ? "조회 중…" : "새로고침"}
        </button>
      </header>}

      {overviewMode && <dl className="overview-status">
        <div>
          <dt>중앙 서버</dt>
          <dd>{data !== null && <StatusBadge status={freshness} />}
            {error !== null ? (data === null ? "조회 실패" : " · 조회 지연")
              : data === null && "조회 중…"}</dd>
        </div>
        <div>
          <dt>에이전트</dt>
          <dd>{agentSnapshot === null ? (overview.error ? "조회 실패" : "조회 중…")
            : `정상 보고 ${reporting} / ${agentSnapshot.agents.length}개${overview.error ? " · 조회 지연" : ""}`}</dd>
        </div>
      </dl>}

      {demo}

      {!overviewMode && <section className="mb-8" aria-labelledby="system-status">
        <h2 id="system-status" className="mb-3 text-lg font-semibold tracking-tight">중앙 서버</h2>
        {isLoading && (
          <div
            role="status"
            className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
          >
            시스템 상태를 조회하고 있습니다.
          </div>
        )}

        {error !== null && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-800"
          >
            <p className="font-semibold">시스템 상태 조회 실패</p>
            <p className="mt-1">{error}</p>
            {data !== null && (
              <p className="mt-1">
                마지막 성공 데이터를 표시하고 있습니다. 자동으로 다시
                조회합니다.
              </p>
            )}
          </div>
        )}

        {data !== null && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
              <StatusBadge status={freshness} />

              <span>
                측정 시각:{" "}
                {data.sampled_at_ms === null
                  ? "아직 표본 없음"
                  : new Date(data.sampled_at_ms).toLocaleString("ko-KR")}
              </span>

              <span>
                표본 경과:{" "}
                {sampleAge === null
                  ? "확인 불가"
                  : `${Math.floor(sampleAge / 1000)}초`}
              </span>
            </div>

            {freshness === "STALE" && (
              <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
                오래된 측정값입니다. 새로고침으로 현재 상태를 확인해 주세요.
              </p>
            )}

            <dl className="status-metrics">
              <MetricCard
                title="중앙 JVM CPU"
                value={formatPercent(data.process_cpu_load)}
              />

              <MetricCard
                title="호스트 CPU"
                value={formatPercent(data.system_cpu_load)}
              />

              <MetricCard
                title="호스트 메모리"
                value={formatPercent(fraction(data.host_memory_used_bytes, data.host_memory_total_bytes))}
                description={`${formatMemory(data.host_memory_used_bytes ?? null)} / ${formatMemory(data.host_memory_total_bytes ?? null)}`}
              />

              <MetricCard
                title="JVM 힙"
                value={formatPercent(fraction(data.heap_used_bytes, data.heap_max_bytes))}
                description={`${formatMemory(data.heap_used_bytes)} / ${formatMemory(data.heap_max_bytes)}`}
              />

              <MetricCard
                title="JVM 가동 시간"
                value={formatDuration(data.uptime_ms)}
              />
            </dl>

            <p className="mt-5 text-xs leading-6 text-slate-500">
              각 조회가 끝나면 5초 후 자동으로 다시 조회합니다. 측정 불가는 해당
              지표를 아직 수집하지 못했거나 실행 환경에서 지원하지 않는
              상태입니다.
            </p>
          </>
        )}
      </section>}

      {!overviewMode && <AgentStatusPanel overview={overview} onSelectRun={onSelectRun} demoRunId={demoRunId}
        selectedKey={selectedSamples ? selected?.key ?? null : null}
        onSelectMetrics={(agent) => {
          setSelected({ key: agentKey(agent), name: "에이전트 " + agent.heartbeat.source_id });
          document.getElementById("operational-charts")?.scrollIntoView();
        }} />}

      <div id="operational-charts" className="scroll-mt-4">
        <TrafficCharts traffic={traffic.data} error={traffic.error} loading={traffic.isLoading}
          samples={(!overviewMode && selectedSamples) || centralHistory}
          target={!overviewMode && selectedSamples && selected ? selected.name : "중앙 서버"}
          canReset={!overviewMode && Boolean(selectedSamples)} onReset={() => setSelected(null)} />
      </div>
    </>
  );
}
