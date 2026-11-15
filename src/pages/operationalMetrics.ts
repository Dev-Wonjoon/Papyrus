import type { AgentStatus } from "../api/agents";

export type ResourceMetrics = {
  process_cpu_load: number | null;
  system_cpu_load: number | null;
  heap_used_bytes: number | null;
  heap_max_bytes: number | null;
  host_memory_used_bytes?: number | null;
  host_memory_total_bytes?: number | null;
};

export type ResourceSample = { at: number; metrics: ResourceMetrics };
export const WINDOW_MS = 15 * 60_000;
const SAMPLE_LIMIT = 181;

export function fraction(used: number | null | undefined, total: number | null | undefined) {
  return used != null && total != null && total > 0 && used >= 0 && used <= total
    ? used / total : null;
}

export function formatPercent(value: number | null | undefined) {
  return value == null ? "측정 불가" : (value * 100).toFixed(1) + "%";
}

export function agentKey(agent: AgentStatus) {
  const { run_id, source_id, instance_id } = agent.heartbeat;
  return JSON.stringify([run_id, source_id, instance_id]);
}

export function rememberSample(samples: ResourceSample[], next: ResourceSample | null, now: number) {
  const recent = samples.filter((sample) => sample.at >= now - WINDOW_MS);
  if (next && next.at > (recent.at(-1)?.at ?? -Infinity)) recent.push(next);
  return recent.slice(-SAMPLE_LIMIT);
}

export const resourceLines = [
  { label: "프로세스 CPU", color: "#1d4ed8", value: (m: ResourceMetrics) => m.process_cpu_load },
  { label: "호스트 CPU", color: "#7e22ce", value: (m: ResourceMetrics) => m.system_cpu_load },
  { label: "호스트 메모리", color: "#047857", value: (m: ResourceMetrics) => fraction(m.host_memory_used_bytes, m.host_memory_total_bytes) },
  { label: "JVM 힙", color: "#b45309", value: (m: ResourceMetrics) => fraction(m.heap_used_bytes, m.heap_max_bytes) },
];

export function formatChartTime(value: number) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}
