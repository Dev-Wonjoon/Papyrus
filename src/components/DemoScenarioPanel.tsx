import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDemoRuns, fetchDemoHistory, fetchDemoStatus, previewDemoCleanup, startDemo } from "../api/demo";
import type { DemoCleanupEntry, DemoRun, DemoRunEntry, DemoScenario } from "../api/demo";
import { fetchQueueStats } from "../api/dashboard";
import { usePolling } from "../hooks/usePolling";

const scenarios: ReadonlyArray<{
  id: DemoScenario;
  title: string;
  description: string;
}> = [
  {
    id: "CENTRAL",
    title: "중앙에서 파싱",
    description: "혼합 로그 800건을 중앙에서 파싱합니다.",
  },
  {
    id: "AGENT",
    title: "에이전트에서 파싱",
    description: "같은 혼합 로그 800건을 에이전트에서 파싱합니다.",
  },
  {
    id: "SWITCH",
    title: "수집 중 파싱 위치 전환",
    description: "처음 800건은 중앙, 다음 800건은 에이전트에서 파싱합니다.",
  },
  {
    id: "AUTO_SWITCH",
    title: "부하 기반 자동 전환",
    description: "모의 호스트 CPU 부하에 따라 중앙 → 에이전트 → 중앙 순으로 파싱 위치가 바뀝니다.",
  },
  {
    id: "STRESS",
    title: "부하 테스트",
    description: "최대 10초간 혼합 로그 5,000건으로 대기열이 쌓이고 줄어드는 과정을 봅니다.",
  },
];

export default function DemoScenarioPanel({
  onSelectRun,
  onRunChange,
}: {
  onSelectRun: (runId: string) => void;
  onRunChange: (runId: string | null) => void;
}) {
  const { data, error, refresh } = usePolling(fetchDemoStatus, {
    intervalMs: 1000,
  });
  const [started, setStarted] = useState<DemoRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const reported = data?.run ?? null;
  if (started && reported?.run_id === started.run_id) setStarted(null);
  const run = started ?? reported;
  const running =
    run !== null && run.phase !== "COMPLETED" && run.phase !== "FAILED";

  const runId = data?.enabled === true ? run?.run_id ?? null : null;
  useEffect(() => {
    onRunChange(runId);
  }, [onRunChange, runId]);

  if (data?.enabled === false) {
    return <section className="console-panel mb-8" aria-labelledby="demo-title">
      <h2 id="demo-title" className="text-lg font-semibold">동작 시연</h2>
      <p className="mt-2 text-sm text-slate-600">중앙 서버에서 시연 기능을 켜면 이 페이지에서 실행할 수 있습니다.</p>
    </section>;
  }

  async function launch(scenario: DemoScenario) {
    setStarting(true);
    setStartError(null);

    try {
      const result = await startDemo(scenario);
      setStarted(result);
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "시연을 시작하지 못했습니다.",
      );
    } finally {
      refresh();
      setStarting(false);
    }
  }

  return (
    <section
      aria-labelledby="demo-title"
      className="console-panel mb-8"
    >
      <h2 id="demo-title" className="text-lg font-semibold">
        동작 시연
      </h2>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {scenarios.filter((scenario) => scenario.id !== "AUTO_SWITCH" || data?.autoEnabled).map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            disabled={data?.enabled !== true || starting || running}
            onClick={() => void launch(scenario.id)}
            data-current={run?.scenario === scenario.id || undefined}
            className="demo-scenario"
          >
            <span className="block font-semibold">{scenario.title}</span>
            <span className="mt-1 block text-sm font-normal text-slate-600">
              {scenario.description}
            </span>
          </button>
        ))}
      </div>

      {(startError ?? error) && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {startError ?? error}
        </p>
      )}
      <DemoFlow run={run} />
      <p className="mt-3 text-sm text-slate-700" role="status">
        {starting ? "시연을 시작하는 중입니다." : run?.message}
      </p>
      {data?.enabled && <DemoRunHistory current={run} onSelectRun={onSelectRun} onDeleted={(ids) => {
        setStarted((previous) => previous && ids.includes(previous.run_id) ? null : previous);
        refresh();
      }} />}
    </section>
  );
}

const historyStateLabels: Record<DemoRunEntry["state"], string> = {
  RUNNING: "진행 중",
  COMPLETED: "완료",
  FAILED: "실패",
  DELETING: "삭제 재시도 가능",
};
const deleteButtonClass = "workspace-action text-red-700 disabled:cursor-not-allowed disabled:opacity-50";

function scenarioTitle(scenario: DemoScenario) {
  return scenarios.find(({ id }) => id === scenario)?.title ?? scenario;
}

type CleanupPreview = { all: boolean; entries: DemoCleanupEntry[] };

function DemoRunHistory({ current, onSelectRun, onDeleted }: {
  current: DemoRun | null;
  onSelectRun: (runId: string) => void;
  onDeleted: (runIds: string[]) => void;
}) {
  const history = usePolling(fetchDemoHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const entries = (history.data ?? []).filter((entry) => !deleted.includes(entry.run_id));
  const visibleCurrent = current && !deleted.includes(current.run_id) ? current : null;
  const selected = entries.find((entry) => entry.run_id === selectedId);
  const activeId = selected?.run_id ?? visibleCurrent?.run_id ?? entries[0]?.run_id;
  const active = entries.find((entry) => entry.run_id === activeId);
  const currentIsListed = entries.some((entry) => entry.run_id === visibleCurrent?.run_id);
  const busy = previewing || deleting;

  async function openPreview(runId?: string) {
    setPreviewing(true);
    setFailure("");
    setNotice("");
    try {
      const targets = await previewDemoCleanup(runId);
      if (targets.length === 0) {
        setNotice("삭제할 종료된 시연이 없습니다.");
        history.refresh();
      } else {
        setPreview({ all: runId === undefined, entries: targets });
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "삭제 대상을 조회하지 못했습니다.");
      history.refresh();
    } finally {
      setPreviewing(false);
    }
  }

  async function remove() {
    if (!preview || deleting) return;
    setDeleting(true);
    setFailure("");
    try {
      const results = await deleteDemoRuns(preview.entries.map(({ run }) => run.run_id));
      const removed = results.filter((result) => result.deleted).map((result) => result.run_id);
      const remaining = results.filter((result) => !result.deleted).map((result) => result.run_id);
      setDeleted((previous) => [...previous, ...removed]);
      onDeleted(removed);
      if (removed.length > 0) setNotice(`시연 ${removed.length}개의 데이터를 삭제했습니다.`);
      if (remaining.length > 0) {
        setFailure("삭제가 끝나지 않은 실행입니다. 다시 시도할 수 있습니다. " + remaining.join(", "));
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "삭제 결과를 확인하지 못했습니다.");
    } finally {
      setDeleting(false);
      setPreview(null);
      history.refresh();
    }
  }

  return <section className="mt-5 space-y-3 border-t border-slate-200 pt-4" aria-labelledby="demo-history">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="demo-history" className="font-semibold">시연 실행 이력</h3>
      <button type="button" className={deleteButtonClass}
        disabled={busy || !entries.some((entry) => entry.state !== "RUNNING")}
        onClick={() => void openPreview()}>시연 데이터 전체 삭제</button>
    </header>
    {activeId ? <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm text-slate-700">
        시연 실행 선택
        <select className="mt-1 block w-full rounded-md border border-slate-300 p-2" value={activeId}
          onChange={(event) => setSelectedId(event.currentTarget.value)}>
          {visibleCurrent && !currentIsListed && (
            <option value={visibleCurrent.run_id}>{scenarioTitle(visibleCurrent.scenario)} · 현재 시연</option>
          )}
          {entries.map((entry) => (
            <option key={entry.run_id} value={entry.run_id}>
              {scenarioTitle(entry.scenario)} · {new Date(entry.started_at_ms).toLocaleString("ko-KR")} · {historyStateLabels[entry.state]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="workspace-action" disabled={busy || active?.state === "DELETING"}
        onClick={() => onSelectRun(activeId)}>이 시연의 로그 보기</button>
      <button type="button" className={deleteButtonClass} disabled={busy || !active || active.state === "RUNNING"}
        onClick={() => void openPreview(activeId)}>이 시연 데이터 삭제</button>
    </div> : history.data && <p className="text-sm text-slate-600">등록된 시연 실행이 없습니다.</p>}
    {history.error && <p role="alert" className="text-sm text-red-700">{history.error}</p>}
    {previewing && <p role="status" className="text-sm text-slate-600">삭제할 건수를 조회하고 있습니다.</p>}
    {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {failure && <p role="alert" className="text-sm break-words text-red-700">{failure}</p>}
    {preview && <DemoCleanupDialog preview={preview} deleting={deleting}
      onCancel={() => setPreview(null)} onDelete={() => void remove()} />}
  </section>;
}

function DemoCleanupDialog({ preview, deleting, onCancel, onDelete }: {
  preview: CleanupPreview;
  deleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const confirmationText = "전체 삭제";
  const canDelete = !deleting && (!preview.all || confirmation === confirmationText);
  const queueCount = preview.entries.reduce((total, entry) => total + entry.queue_count, 0);
  const indexedCount = preview.entries.reduce((total, entry) => total + entry.indexed_count, 0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} aria-labelledby="demo-cleanup-title"
    className="m-auto max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
    onCancel={(event) => {
      event.preventDefault();
      if (!deleting) onCancel();
    }}>
    <h3 id="demo-cleanup-title" className="text-lg font-semibold">
      {preview.all ? "시연 데이터 전체 삭제" : "이 시연 데이터 삭제"}
    </h3>
    <p className="mt-2 text-sm text-slate-700">
      시연 {preview.entries.length.toLocaleString("ko-KR")}개 · 중앙 큐 기록 {queueCount.toLocaleString("ko-KR")}건
      {" · 검색 문서 "}{indexedCount.toLocaleString("ko-KR")}건
    </p>
    <p className="mt-1 text-xs text-slate-500">중앙 큐와 검색 인덱스에 같은 로그가 포함될 수 있습니다.</p>
    <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3 text-sm">
      {preview.entries.map(({ run }) => <li key={run.run_id}>
        <span className="font-medium">{scenarioTitle(run.scenario)}</span>
        <span className="block break-all text-xs text-slate-600">{run.run_id}</span>
      </li>)}
    </ul>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (canDelete) onDelete();
    }}>
      {preview.all && <label className="block text-sm text-slate-700">
        계속하려면 ‘{confirmationText}’를 입력하세요.
        <input className="mt-1 w-full rounded-md border border-slate-300 p-2"
          value={confirmation} disabled={deleting} onChange={(event) => setConfirmation(event.currentTarget.value)} />
      </label>}
      <div className="flex justify-end gap-2">
        <button type="button" className="workspace-action" disabled={deleting} onClick={onCancel}>취소</button>
        <button type="submit" className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!canDelete}>{deleting ? "삭제 중…" : "삭제 확인"}</button>
      </div>
    </form>
  </dialog>;
}

function DemoFlow({ run }: { run: DemoRun | null }) {
  const active = run?.scenario === "AUTO_SWITCH"
    ? run.auto_progress?.applied_mode ?? null
    : run?.scenario === "AGENT" || run?.switch_phase === "APPLIED"
      ? "AGENT" : run ? "CENTRAL" : null;
  const stages = [
    { text: "로그 파일" },
    { text: "에이전트", mode: "AGENT" },
    { text: "중앙 수신 · SQLite" },
    { text: "중앙 처리", mode: "CENTRAL" },
    { text: "Elasticsearch 저장" },
  ];

  return (
    <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
      <h3 className="font-semibold">로그 처리 흐름</h3>
      <ol className="flex flex-wrap items-center gap-2" aria-label="로그 처리 순서">
        {stages.map((stage, index) => {
          const parsing = active !== null && active === stage.mode;
          return (
            <li key={stage.text} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="text-slate-400">→</span>}
              <span className={"rounded-lg border px-3 py-2 text-sm " +
                (parsing
                  ? active === "AGENT" ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-blue-300 bg-blue-50 text-blue-950"
                  : "border-slate-200 bg-slate-50 text-slate-700")}>
                {stage.text}{parsing && " · JSON 파싱"}
              </span>
            </li>
          );
        })}
      </ol>
      {run?.scenario === "SWITCH" && <SwitchTimeline phase={run.switch_phase} />}
      {run?.auto_progress && <AutoSwitchProgress progress={run.auto_progress} phase={run.switch_phase} />}
      {run && <DemoCounts key={run.run_id} run={run} />}
    </div>
  );
}

const autoStages = [
  { id: "BASELINE", label: "중앙 파싱", reason: "중앙 파싱으로 시작" },
  { id: "CENTRAL_BUSY", label: "에이전트로 전환", reason: "중앙 CPU 부하가 높고 에이전트에 여유가 있음" },
  { id: "AGENT_BUSY", label: "중앙으로 복귀", reason: "에이전트 CPU 부하가 높고 중앙에 여유가 있음" },
] as const;

function AutoSwitchProgress({ progress, phase }: {
  progress: NonNullable<DemoRun["auto_progress"]>;
  phase: DemoRun["switch_phase"];
}) {
  const phaseLabel = phase === "APPLIED" ? "적용 완료" : phase === "RECEIVED" ? "명령 수신 · 적용 대기"
    : phase === "SENT" ? "자동 명령 발행" : "전환 조건 평가 중";
  const current = autoStages.find((stage) => stage.id === progress.stage);
  const mode = progress.applied_mode === "AGENT" ? "에이전트 파싱" : "중앙 파싱";

  return (
    <section aria-label="부하 기반 자동 전환 진행" className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="자동 전환 순서">
        {autoStages.map(({ id, label }) => (
          <li key={id} aria-current={id === progress.stage ? "step" : undefined}
            className={id === progress.stage
              ? "rounded bg-teal-100 px-2 py-1 font-semibold text-teal-950"
              : "px-2 py-1 text-slate-600"}>
            {label}
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-slate-600">중앙 모의 CPU</dt><dd className="font-semibold tabular-nums">{progress.central_cpu}%</dd></div>
        <div><dt className="text-slate-600">에이전트 모의 CPU</dt><dd className="font-semibold tabular-nums">{progress.agent_cpu}%</dd></div>
        <div><dt className="text-slate-600">실제 적용 모드</dt><dd className="font-semibold">{mode}</dd></div>
      </dl>
      {progress.stage !== "BASELINE" && (
        <p className="text-sm text-teal-950"><strong>{phaseLabel}</strong> · {current?.reason}</p>
      )}
    </section>
  );
}

function SwitchTimeline({ phase }: { phase: DemoRun["switch_phase"] }) {
  const steps = ["중앙 파싱", "전환 명령 발행", "명령 수신 · 적용 대기", "에이전트 파싱 적용"];
  const current = phase === "APPLIED" ? 3 : phase === "RECEIVED" ? 2 : phase === "SENT" ? 1 : 0;

  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="파싱 위치 전환">
      {steps.map((step, index) => (
        <li key={step} aria-current={index === current ? "step" : undefined}
          className={index === current
            ? "rounded bg-violet-100 px-2 py-1 font-semibold text-violet-950"
            : "px-2 py-1 text-slate-600"}>
          {index + 1}. {step}
        </li>
      ))}
    </ol>
  );
}

function DemoCounts({ run }: { run: DemoRun }) {
  const read = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ run_id: run.run_id });
    const [counts, failures] = await Promise.all([
      fetchQueueStats(run.run_id, signal),
      fetch("/api/demo/scenario/parse-failures?" + params, { signal, cache: "no-store" }),
    ]);
    if (!failures.ok) throw new Error("파싱 실패 건수를 조회하지 못했습니다.");
    const failed: number = await failures.json();
    return { counts, failed };
  }, [run.run_id]);
  const { data, error } = usePolling(read, { intervalMs: 1000 });
  const expected = run.expected_count;
  const counters = [
    ["생성", run.generated_count, expected],
    ["중앙 수신", data?.counts.total_count, expected],
    ["저장 완료", data?.counts.completed_count, expected],
    ["중앙 처리 대기", data?.counts.pending_count],
    ["파싱 실패", data?.failed],
    ["저장 실패", data?.counts.storage_failed_count],
  ] as const;

  return (
    <>
      {run.scenario === "STRESS" && (
        <p className="text-sm text-slate-600 tabular-nums">
          평균 생성률 {Math.round(run.generated_per_second).toLocaleString("ko-KR")}건/초
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {counters.map(([label, value, target]) => (
          <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {value?.toLocaleString("ko-KR") ?? "—"}
              {target !== undefined && " / " + target.toLocaleString("ko-KR")}건
            </dd>
          </div>
        ))}
      </dl>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </>
  );
}
