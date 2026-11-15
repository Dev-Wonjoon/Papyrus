import { useCallback, useEffect, useState } from "react";
import { fetchDemoStatus, startDemo } from "../api/demo";
import type { DemoRun, DemoScenario } from "../api/demo";
import { fetchQueueStats } from "../api/dashboard";
import { usePolling } from "../hooks/usePolling";

const scenarios: ReadonlyArray<{
  id: DemoScenario;
  title: string;
  description: string;
  colors: string;
}> = [
  {
    id: "CENTRAL",
    title: "중앙에서 파싱",
    colors: "border-blue-300 bg-blue-50 text-blue-950 enabled:hover:border-blue-400 enabled:hover:bg-blue-100 focus-visible:ring-blue-500 disabled:border-blue-200 disabled:bg-blue-50/60 disabled:text-blue-800",
    description: "혼합 로그 800건을 중앙에서 파싱합니다.",
  },
  {
    id: "AGENT",
    title: "에이전트에서 파싱",
    colors: "border-emerald-300 bg-emerald-50 text-emerald-950 enabled:hover:border-emerald-400 enabled:hover:bg-emerald-100 focus-visible:ring-emerald-500 disabled:border-emerald-200 disabled:bg-emerald-50/60 disabled:text-emerald-800",
    description: "같은 혼합 로그 800건을 에이전트에서 파싱합니다.",
  },
  {
    id: "SWITCH",
    title: "수집 중 파싱 위치 전환",
    colors: "border-violet-300 bg-violet-50 text-violet-950 enabled:hover:border-violet-400 enabled:hover:bg-violet-100 focus-visible:ring-violet-500 disabled:border-violet-200 disabled:bg-violet-50/60 disabled:text-violet-800",
    description: "처음 800건은 중앙, 다음 800건은 에이전트에서 파싱합니다.",
  },
  {
    id: "AUTO_SWITCH",
    title: "부하 기반 자동 전환",
    colors: "border-teal-300 bg-teal-50 text-teal-950 enabled:hover:border-teal-400 enabled:hover:bg-teal-100 focus-visible:ring-teal-500 disabled:border-teal-200 disabled:bg-teal-50/60 disabled:text-teal-800",
    description: "모의 호스트 CPU 부하에 따라 중앙 → 에이전트 → 중앙 순으로 파싱 위치가 바뀝니다.",
  },
  {
    id: "STRESS",
    title: "부하 테스트",
    colors: "border-amber-300 bg-amber-50 text-amber-950 enabled:hover:border-amber-400 enabled:hover:bg-amber-100 focus-visible:ring-amber-500 disabled:border-amber-200 disabled:bg-amber-50/60 disabled:text-amber-800",
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
    return <p className="text-sm text-slate-600">중앙 서버에서 시연 기능을 켜면 이 페이지에서 실행할 수 있습니다.</p>;
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
      className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="demo-title" className="text-xl font-semibold">
        동작 시연
      </h2>

      <div className={"mt-4 grid gap-4 sm:grid-cols-2 " + (data?.autoEnabled ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        {scenarios.filter((scenario) => scenario.id !== "AUTO_SWITCH" || data?.autoEnabled).map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            disabled={data?.enabled !== true || starting || running}
            onClick={() => void launch(scenario.id)}
            className={`rounded-xl border-2 p-4 text-left transition-colors
              focus-visible:ring-2 focus-visible:ring-offset-2
              enabled:cursor-pointer disabled:cursor-not-allowed ${scenario.colors}`}
          >
            <span className="block font-semibold">{scenario.title}</span>
            <span className="mt-2 block text-sm">
              {scenario.description}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm" role="status">
        {starting ? "시연을 시작하는 중입니다." : run?.message}
      </p>

      <DemoFlow run={run} />
      {run && (
        <button
          type="button"
          onClick={() => onSelectRun(run.run_id)}
          className="mt-2 text-sm font-medium text-blue-700 underline"
        >
          이 시연의 로그 보기
        </button>
      )}

      {(startError ?? error) && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {startError ?? error}
        </p>
      )}
    </section>
  );
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
