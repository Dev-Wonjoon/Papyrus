export type ParsingMode = "CENTRAL" | "AGENT";

export interface AgentHeartbeat {
  run_id: string;
  source_id: string;
  instance_id: string;
  applied_mode: "CENTRAL" | "AGENT";
  process_cpu_load: number | null;
  system_cpu_load: number | null;
  heap_used_bytes: number | null;
  heap_max_bytes: number | null;
  host_memory_used_bytes?: number | null;
  host_memory_total_bytes?: number | null;
  pending_batch_count: number;
  pending_bytes: number;
  max_pending_batches: number;
  max_pending_bytes: number;
}

export interface AgentStatus {
  status: "ONLINE" | "STALE";
  last_received_at_ms: number;
  age_ms: number;
  heartbeat: AgentHeartbeat;
}

export interface AgentOverview {
  stale_after_ms: number;
  agents: AgentStatus[];
}

export async function fetchAgentOverview(
  signal: AbortSignal,
): Promise<AgentOverview> {
  const response = await fetch("/api/agents/overview", {
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `에이전트 목록 조회에 실패했습니다. HTTP ${response.status}`,
    );
  }

  return response.json();
}

export type AgentControlTarget = Pick<
  AgentHeartbeat,
  "run_id" | "source_id" | "instance_id"
>;

export type AgentCommandPhase =
  | "PENDING_DELIVERY"
  | "PENDING_APPLY"
  | "APPLIED";

export interface AgentControlStatus {
  target: AgentControlTarget;
  controller_instance_id: string;
  active: boolean;
  applied_mode: ParsingMode;
  command: {
    id: {
      controller_instance_id: string;
      command_version: number;
    };
    mode: ParsingMode;
  } | null;
  phase: AgentCommandPhase | null;
  command_reason: string | null;
}

export type AgentControlResult =
  | { kind: "registered"; status: AgentControlStatus }
  | { kind: "unregistered" };

export async function fetchAgentControl(
  target: AgentControlTarget,
  signal: AbortSignal,
): Promise<AgentControlResult> {
  const params = new URLSearchParams(target);
  const response = await fetch(`/api/agents/control?${params}`, {
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return { kind: "unregistered" };
  }

  if (!response.ok) {
    throw new Error(`에이전트 제어 상태 조회에 실패했습니다. HTTP ${response.status}`);
  }

  const status: AgentControlStatus = await response.json();
  return { kind: "registered", status };
}