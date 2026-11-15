export type DemoScenario = "CENTRAL" | "AGENT" | "SWITCH" | "STRESS" | "AUTO_SWITCH";

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
  const response = await fetch("/api/demo/scenario", {
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
  const response = await fetch("/api/demo/scenario", {
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