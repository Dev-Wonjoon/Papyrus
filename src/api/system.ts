export interface SystemStatus {
  instance_id: string;
  metrics_status: "STARTING" | "FRESH" | "STALE";
  server_time_ms: number;
  sample_interval_ms: number;
  stale_after_ms: number;
  sample_sequence: number;
  sampled_at_ms: number | null;
  sample_age_ms: number | null;
  uptime_ms: number | null;
  process_cpu_load: number | null;
  system_cpu_load: number | null;
  heap_used_bytes: number | null;
  heap_max_bytes: number | null;
  host_memory_used_bytes?: number | null;
  host_memory_total_bytes?: number | null;
}

export async function fetchSystemStatus(
  signal: AbortSignal,
): Promise<SystemStatus> {
  const response = await fetch("/api/system/status", {
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`시스템 상태 조회에 실패했습니다. HTTP ${response.status}`);
  }

  return response.json();
}
