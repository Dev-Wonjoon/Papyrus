import { useCallback, useEffect, useState } from "react";
import { fetchAgentControl, fetchAgentOverview } from "../api/agents";
import type {
  AgentCommandPhase,
  AgentHeartbeat,
  AgentStatus,
  ParsingMode,
} from "../api/agents";
import { usePolling } from "../hooks/usePolling";
import { agentKey, formatPercent, fraction } from "../pages/operationalMetrics";

type AgentCardProps = {
  agent: AgentStatus;
  staleAfterMs: number;
  elapsedMs: number;
  onSelectRun?: (runId: string) => void;
  onSelectMetrics?: (agent: AgentStatus) => void;
  selected: boolean;
  isDemoAgent: boolean;
};

function formatMemory(value: number | null): string {
  return value === null
    ? "측정 불가"
    : `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

const modeLabels: Record<ParsingMode, string> = {
  CENTRAL: "CENTRAL · 중앙 파싱",
  AGENT: "AGENT · 에이전트 파싱",
};

const phaseLabels: Record<AgentCommandPhase, string> = {
  PENDING_DELIVERY: "PENDING_DELIVERY · 전달 대기",
  PENDING_APPLY: "PENDING_APPLY · 적용 대기",
  APPLIED: "APPLIED · 적용 완료",
};

const commandReasonLabels = new Map([
  [
    "CENTRAL_BUSY_AGENT_AVAILABLE",
    "중앙 CPU 부하가 높고 에이전트에 여유가 있음",
  ],
  [
    "AGENT_BUSY_CENTRAL_AVAILABLE",
    "에이전트 CPU 부하가 높고 중앙에 여유가 있음",
  ],
]);

function AgentControlDetails({ heartbeat }: { heartbeat: AgentHeartbeat }) {
  const { run_id, source_id, instance_id } = heartbeat;
  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchAgentControl({ run_id, source_id, instance_id }, signal),
    [run_id, source_id, instance_id],
  );
  const { data, error } = usePolling(fetcher);

  if (error !== null || data === null || data.kind === "unregistered") {
    const message =
      data?.kind === "unregistered" ? "제어 세션 미등록" : "제어 상태 조회 중…";

    return (
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
        {error !== null ? (
          <p role="alert" className="text-red-700">
            제어 상태 조회 실패 · {error}
          </p>
        ) : (
          <p className="text-slate-600">{message}</p>
        )}
        <p className="mt-2 text-slate-700">
          하트비트 보고 모드 · {modeLabels[heartbeat.applied_mode]}
        </p>
      </div>
    );
  }

  const { active, applied_mode, command, phase, command_reason } = data.status;
  const fields = [
    {
      label: "중앙 명령 모드",
      value: command === null ? "명령 없음" : modeLabels[command.mode],
    },
    { label: "실제 적용 모드", value: modeLabels[applied_mode] },
    {
      label: "명령 상태",
      value: phase === null ? "명령 없음" : phaseLabels[phase],
    },
    {
      label: "자동 명령 발행 이유",
      value:
        command_reason === null
          ? "해당 없음"
          : (commandReasonLabels.get(command_reason) ?? command_reason),
    },
  ];

  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4">
      {!active && (
        <p className="mb-3 text-sm font-semibold text-amber-800">
          제어 세션 만료 · 마지막 제어 보고값
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AgentCard({
  agent,
  staleAfterMs,
  elapsedMs,
  onSelectRun,
  onSelectMetrics,
  selected,
  isDemoAgent,
}: AgentCardProps) {
  const heartbeat = agent.heartbeat;
  const ageMs = agent.age_ms + elapsedMs;

  // 조회 이후 하트비트가 갱신되지 않은 시간도 반영한다.
  const stale = agent.status === "STALE" || ageMs >= staleAfterMs;

  const statusStyle = stale
    ? "bg-amber-50 text-amber-800 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  const metrics = [
    {
      title: "프로세스 CPU",
      value: formatPercent(heartbeat.process_cpu_load),
    },
    {
      title: "호스트 CPU",
      value: formatPercent(heartbeat.system_cpu_load),
    },
    {
      title: "호스트 메모리",
      value: formatPercent(fraction(heartbeat.host_memory_used_bytes, heartbeat.host_memory_total_bytes)),
    },
    {
      title: "JVM 힙",
      value: formatPercent(fraction(heartbeat.heap_used_bytes, heartbeat.heap_max_bytes)),
      details: `${formatMemory(heartbeat.heap_used_bytes)} / ${formatMemory(heartbeat.heap_max_bytes)}`,
    },
    {
      title: "미확인 배치 / 한도",
      value: `${heartbeat.pending_batch_count.toLocaleString("ko-KR")} / ${heartbeat.max_pending_batches.toLocaleString("ko-KR")}개`,
    },
    {
      title: "미확인 데이터 / 한도",
      value: `${formatMemory(heartbeat.pending_bytes)} / ${formatMemory(heartbeat.max_pending_bytes)}`,
    },
  ];

  return (
    <article className={"rounded-2xl border bg-white p-5 shadow-sm sm:p-6 "
      + (isDemoAgent ? "border-indigo-300" : "border-slate-200")}>
      {onSelectRun !== undefined && (
        <button
          type="button"
          onClick={() => onSelectRun(heartbeat.run_id)}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100"
        >
          이 실행 조회
        </button>
      )}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-all text-lg font-semibold text-slate-900">
            {heartbeat.source_id}
          </h3>

          <p className="mt-1 break-all text-sm text-slate-500">
            실행 ID: {heartbeat.run_id}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isDemoAgent && (
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
              이번 시연
            </span>
          )}
          {onSelectMetrics && <button type="button" aria-pressed={selected}
            onClick={() => onSelectMetrics(agent)}
            className="rounded-lg border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 aria-pressed:bg-indigo-100">
            자원 추이 보기
          </button>}
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle}`}
          >
            {stale ? "STALE · 보고 지연" : "ONLINE · 정상 보고"}
          </span>
        </div>
      </header>

      <AgentControlDetails heartbeat={heartbeat} />

      <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.title} className="min-w-0">
            <dt className="text-xs font-medium text-slate-500">
              {metric.title}
            </dt>

            <dd className="mt-2 text-sm leading-6 font-semibold break-words text-slate-900 tabular-nums">
              {metric.value}
            </dd>
            {metric.details && <dd className="text-xs text-slate-600">{metric.details}</dd>}
          </div>
        ))}
      </dl>

      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">
        <span>
          마지막 수신:{" "}
          {new Date(agent.last_received_at_ms).toLocaleString("ko-KR")}
        </span>

        <span>
          수신 후 경과: {Math.floor(ageMs / 1000).toLocaleString("ko-KR")}초
        </span>
      </footer>

      {stale && (
        <p className="mt-3 text-xs leading-6 text-amber-800">
          조회된 하트비트가 오래됐습니다. 새로고침으로 현재 보고 상태를 확인해
          주세요. 표시된 자원과 큐 사용량은 마지막 보고값입니다.
        </p>
      )}
    </article>
  );
}

export default function AgentStatusPanel({
  onSelectRun,
  overview,
  onSelectMetrics,
  selectedKey,
  demoRunId,
}: {
  onSelectRun?: (runId: string) => void;
  overview: ReturnType<typeof usePolling<Awaited<ReturnType<typeof fetchAgentOverview>>>>;
  onSelectMetrics: (agent: AgentStatus) => void;
  selectedKey: string | null;
  demoRunId: string | null;
}) {
  const { data, error, isLoading, isFetching, receivedAt, refresh } = overview;
  const [now, setNow] = useState(() => performance.now());

  // 마지막 하트비트의 경과 시간을 화면에서도 갱신한다.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(performance.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const elapsedMs = receivedAt !== null ? Math.max(0, now - receivedAt) : 0;
  const agents = data?.agents ?? [];
  const demoAgents = demoRunId === null ? [] : agents.filter((agent) => agent.heartbeat.run_id === demoRunId);
  const orderedAgents = demoAgents.length === 0
    ? agents
    : [...demoAgents, ...agents.filter((agent) => agent.heartbeat.run_id !== demoRunId)];

  return (
    <section
      aria-labelledby="agents-heading"
      className="mt-12 border-t border-slate-200 pt-8"
    >
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="agents-heading"
            className="text-xl font-bold tracking-tight text-slate-900"
          >
            에이전트 상태
            {data !== null && (
              <span className="ml-2 text-base font-medium text-slate-500">
                {data.agents.length}개
              </span>
            )}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            수신된 하트비트를 기준으로 실제 파싱 위치와 자원 사용량을
            표시합니다.
          </p>
        </div>

        <button
          type="button"
          disabled={isFetching}
          onClick={refresh}
          className="self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-50 sm:self-auto"
        >
          {isFetching ? "조회 중…" : "목록 새로고침"}
        </button>
      </header>

      {isLoading && (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
        >
          에이전트 목록을 조회하고 있습니다.
        </p>
      )}

      {error !== null && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-800"
        >
          <p className="font-semibold">에이전트 목록 조회 실패</p>
          <p className="mt-1">{error}</p>
          {data !== null && (
            <p className="mt-1">
              마지막 성공 데이터를 표시하고 있습니다. 자동으로 다시 조회합니다.
            </p>
          )}
        </div>
      )}

      {data !== null && (
        <>
          {demoRunId !== null && demoAgents.length === 0 && (
            <p className="mb-4 text-sm text-slate-600">
              이번 시연의 에이전트 하트비트가 현재 목록에 없습니다.
            </p>
          )}
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <p className="font-medium text-slate-700">
                수신된 에이전트 하트비트가 없습니다.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                에이전트를 실행한 후 목록을 새로고침해 주세요.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orderedAgents.map((agent) => (
                <AgentCard
                  key={agentKey(agent)}
                  isDemoAgent={agent.heartbeat.run_id === demoRunId}
                  selected={agentKey(agent) === selectedKey}
                  onSelectMetrics={onSelectMetrics}
                  agent={agent}
                  staleAfterMs={data.stale_after_ms}
                  elapsedMs={elapsedMs}
                  onSelectRun={onSelectRun}
                />
              ))}
            </div>
          )}

          <p className="mt-4 text-xs leading-6 text-slate-500">
            각 조회가 끝나면 5초 후 자동으로 다시 조회합니다. STALE은 마지막
            보고가 오래됐다는 의미이며, 에이전트 종료가 확정됐다는 뜻은
            아닙니다.
          </p>
        </>
      )}
    </section>
  );
}
