export type DemoScenario = "CENTRAL" | "AGENT" | "SWITCH" | "STRESS" | "AUTO_SWITCH";
const DEMO_API = "/api/demo/scenario";

export interface DemoRunEntry {
  run_id: string;
  scenario: DemoScenario;
  started_at_ms: number;
  state: "RUNNING" | "COMPLETED" | "FAILED" | "DELETING";
}

export interface DemoCleanupEntry {
  run: DemoRunEntry;
  queue_count: number;
  indexed_count: number;
}

export interface DemoCleanupResult {
  run_id: string;
  deleted: boolean;
}

export interface DemoRun {
  run_id: string;
  scenario: DemoScenario;
  phase:
    | "STARTING"
    | "WRITING"
    | "WAITING_FOR_SWITCH"
    | "DRAINING"
    | "COMPLETED"
    | "FAILED";
  message: string;
  expected_count: number;
  generated_count: number;
  generated_per_second: number;
  switch_phase: "SENT" | "RECEIVED" | "APPLIED" | null;
  auto_progress?: {
    stage: "BASELINE" | "CENTRAL_BUSY" | "AGENT_BUSY";
    central_cpu: number;
    agent_cpu: number;
    applied_mode: "CENTRAL" | "AGENT";
  } | null;
}

export async function fetchDemoStatus(signal: AbortSignal) {
  const response = await fetch(DEMO_API, {
    signal,
    cache: "no-store",
  });

  if (response.status === 404) {
    return { enabled: false, autoEnabled: false, run: null };
  }
  if (!response.ok) {
    throw new Error(`시연 상태 조회 실패 (${response.status})`);
  }

  const data: { run: DemoRun | null; auto_enabled?: boolean } = await response.json();
  return { enabled: true, autoEnabled: data.auto_enabled === true, run: data.run };
}

export async function startDemo(scenario: DemoScenario): Promise<DemoRun> {
  const response = await fetch(DEMO_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });

  if (response.status === 409) {
    throw new Error("이미 다른 시연이 실행 중입니다.");
  }
  if (response.status === 503) {
    throw new Error("중앙 서버의 시연용 agent.jar 경로를 확인하세요.");
  }
  if (!response.ok) {
    throw new Error(`시연 시작 실패 (${response.status})`);
  }

  return response.json();
}

export async function fetchDemoHistory(signal: AbortSignal): Promise<DemoRunEntry[]> {
  const response = await fetch(DEMO_API + "/history", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("시연 실행 이력을 조회하지 못했습니다.");
  return response.json();
}

export async function previewDemoCleanup(runId?: string): Promise<DemoCleanupEntry[]> {
  const query = runId ? "?" + new URLSearchParams({ run_id: runId }) : "";
  const response = await fetch(DEMO_API + "/cleanup" + query, { cache: "no-store" });
  if (!response.ok) throw new Error("삭제 대상을 조회하지 못했습니다. 실행 상태를 확인해 주세요.");
  return response.json();
}

export async function deleteDemoRuns(runIds: string[]): Promise<DemoCleanupResult[]> {
  const response = await fetch(DEMO_API + "/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_ids: runIds }),
  });
  if (!response.ok) throw new Error("시연 데이터 삭제에 실패했습니다. 실행 이력을 확인해 주세요.");
  return response.json();
}
