import { useCallback, useEffect, useId, useState } from "react";
import { fetchAgentControl, fetchAgentOverview } from "../api/agents";
import type {
  AgentCommandPhase,
  AgentHeartbeat,
  AgentStatus,
  ParsingMode,
} from "../api/agents";
import { usePolling } from "../hooks/usePolling";
import { agentKey, formatPercent, fraction } from "../pages/operationalMetrics";

type AgentRowProps = {
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

function AgentRow({
  agent,
  staleAfterMs,
  elapsedMs,
  onSelectRun,
  onSelectMetrics,
  selected,
  isDemoAgent,
}: AgentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const heartbeat = agent.heartbeat;
  const ageMs = agent.age_ms + elapsedMs;

  // 조회 이후 하트비트가 갱신되지 않은 시간도 반영한다.
  const stale = agent.status === "STALE" || ageMs >= staleAfterMs;

  const statusStyle = stale
    ? "bg-amber-50 text-amber-800 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  const processCpu = formatPercent(heartbeat.process_cpu_load);
  const hostMemory = formatPercent(fraction(heartbeat.host_memory_used_bytes, heartbeat.host_memory_total_bytes));
  const metrics = [
    {
      title: "프로세스 CPU",
      value: processCpu,
    },
    {
      title: "호스트 CPU",
      value: formatPercent(heartbeat.system_cpu_load),
    },
    {
      title: "호스트 메모리",
      value: hostMemory,
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

  const age = Math.floor(ageMs / 1000).toLocaleString("ko-KR") + "초 전";
  const received = new Date(agent.last_received_at_ms);
  return (
    <>
      <tr role="row" className="agent-row" data-highlight={selected || isDemoAgent || undefined}>
        <th role="rowheader" scope="row" className="agent-source">
          <span className="font-semibold break-all">{heartbeat.source_id}</span>
          {isDemoAgent && <span className="ml-2 text-xs font-semibold text-indigo-700">이번 시연</span>}
        </th>
        <td role="cell">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle}`}>
            {stale ? "보고 지연" : "정상 보고"}
          </span>
        </td>
        <td role="cell"><span className="agent-mobile-label">파싱 위치</span>
          {heartbeat.applied_mode === "CENTRAL" ? "중앙" : "에이전트"}</td>
        <td role="cell"><span className="agent-mobile-label">프로세스 CPU</span>{processCpu}</td>
        <td role="cell"><span className="agent-mobile-label">호스트 메모리</span>{hostMemory}</td>
        <td role="cell"><span className="agent-mobile-label">최근 수신</span>
          <time dateTime={received.toISOString()} title={received.toLocaleString("ko-KR")}>{age}</time></td>
        <td role="cell" className="agent-controls">
          <button type="button" className="workspace-text-action" aria-expanded={expanded}
            aria-controls={expanded ? detailId : undefined} onClick={() => setExpanded(!expanded)}>
            {expanded ? "세부 정보 닫기" : "세부 정보"}
          </button>
        </td>
      </tr>
      {expanded && <tr role="row" className="agent-detail-row">
        <td role="cell" id={detailId} colSpan={7}>
          <p className="text-xs break-all text-slate-600">실행 ID · {heartbeat.run_id}</p>
          <p className="mt-1 text-xs text-slate-600">마지막 수신 · {received.toLocaleString("ko-KR")}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {onSelectRun && <button type="button" className="workspace-text-action"
              onClick={() => onSelectRun(heartbeat.run_id)}>이 실행 조회</button>}
            {onSelectMetrics && <button type="button" className="workspace-text-action"
              aria-pressed={selected} onClick={() => onSelectMetrics(agent)}>자원 추이 보기</button>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {metrics.map(({ title, value, details }) => (
              <div key={title} className="min-w-0">
                <dt className="text-xs text-slate-600">{title}</dt>
                <dd className="font-semibold break-words tabular-nums">{value}</dd>
                {details && <dd className="text-xs text-slate-600">{details}</dd>}
              </div>
            ))}
          </dl>
          {stale && <p className="mt-3 text-xs text-amber-800">자원과 큐 사용량은 마지막 보고값입니다.</p>}
          <AgentControlDetails heartbeat={heartbeat} />
        </td>
      </tr>}
    </>
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
      className="mb-8 border-t border-slate-200 pt-5"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 id="agents-heading" className="text-lg font-semibold tracking-tight">에이전트 상태</h2>
          {data !== null && <span className="text-sm text-slate-600">{data.agents.length}개</span>}
        </div>

        <button
          type="button"
          disabled={isFetching}
          onClick={refresh}
          className="workspace-action disabled:cursor-wait disabled:opacity-50"
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
            <table className="agent-table" role="table" aria-labelledby="agents-heading">
              <thead role="rowgroup">
                <tr role="row">
                  {["소스 ID", "연결 상태", "파싱 위치", "프로세스 CPU", "호스트 메모리", "최근 수신", "작업"].map((label) =>
                    <th key={label} role="columnheader" scope="col">{label}</th>)}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {orderedAgents.map((agent) => (
                  <AgentRow
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
              </tbody>
            </table>
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
