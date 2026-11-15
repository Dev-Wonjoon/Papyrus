export type ParsingMode = "CENTRAL" | "AGENT";
export type ParseStatus = "SUCCESS" | "FAILED";

export interface QueueStats {
  run_id: string;
  total_count: number;
  pending_count: number;
  processing_count: number;
  retry_wait_count: number;
  completed_count: number;
  storage_failed_count: number;
}

export interface QueueTraffic {
  window_start_ms: number;
  window_end_ms: number;
  bucket_ms: number;
  queued_count: number;
  processing_count: number;
  retry_wait_count: number;
  counts: number[];
}

export async function fetchQueueTraffic(signal: AbortSignal): Promise<QueueTraffic> {
  const response = await getResponse("/api/queue/traffic", signal);
  return response.json();
}

export interface LogQuery {
  sourceId: string;
  mode: "" | ParsingMode;
  parseStatus: "" | ParseStatus;
  q: string;
}

export interface LogItem {
  document_id: string;
  run_id: string;
  source_id: string;
  event_id: string;
  mode: ParsingMode;
  parse_status: ParseStatus;
  raw_preview: string;
}

export interface LogCursor {
  sequence: string;
  shard_doc: string;
}

export interface LogChunk {
  pit_id: string | null;
  total_count: number | null;
  items: LogItem[];
  next_cursor: LogCursor | null;
}

export class LogSnapshotExpired extends Error {
  constructor() {
    super("로그 검색 시간이 만료됐습니다. 검색을 새로고침하세요.");
  }
}

export interface LogDetail {
  document_id: string;
  document: Record<string, unknown>;
  originalJson: string;
}

async function getResponse(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const message =
      response.status === 400
        ? "조회 조건이나 페이지 범위를 확인해 주세요."
        : response.status === 404
          ? "해당 실행의 로그 문서를 찾을 수 없습니다."
          : response.status === 503
            ? "저장소에서 데이터를 읽지 못했습니다."
            : `데이터 조회에 실패했습니다. HTTP ${response.status}`;

    throw new Error(message);
  }

  return response;
}

export async function fetchQueueStats(
  runId: string,
  signal: AbortSignal,
): Promise<QueueStats> {
  const params = new URLSearchParams({ run_id: runId });
  const response = await getResponse(`/api/queue/stats?${params}`, signal);

  return response.json();
}

export async function fetchLogChunk(
  runId: string,
  query: LogQuery,
  pitId: string | null,
  after: LogCursor | null,
  signal: AbortSignal,
): Promise<LogChunk> {
  const response = await fetch("/api/logs/chunks", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    signal,
    body: JSON.stringify({
      run_id: runId || null,
      source_id: query.sourceId || null,
      mode: query.mode || null,
      parse_status: query.parseStatus || null,
      q: query.q || null,
      pit_id: pitId,
      after,
    }),
  });
  if (response.status === 410) throw new LogSnapshotExpired();
  if (!response.ok) throw new Error("로그를 불러오지 못했습니다. HTTP " + response.status);
  return response.json();
}

export function closeLogSnapshot(pitId: string) {
  return fetch("/api/logs/chunks/close", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pit_id: pitId }),
  }).catch(() => undefined);
}

export async function fetchRunIds(
  query: string,
  after: string | null,
  signal: AbortSignal,
): Promise<{ items: string[]; next_after: string | null }> {
  const params = new URLSearchParams({ q: query });
  if (after !== null) params.set("after", after);
  const response = await getResponse("/api/logs/run-ids?" + params, signal);
  return response.json();
}

export async function fetchLogDetail(
  runId: string,
  documentId: string,
  signal: AbortSignal,
): Promise<LogDetail> {
  const params = new URLSearchParams({ run_id: runId });
  const response = await getResponse(
    `/api/logs/${encodeURIComponent(documentId)}?${params}`,
    signal,
  );

  // 저장 문서는 큰 숫자의 정밀도를 보존하도록 원본 응답도 반환한다.
  const originalJson = await response.text();
  const result = JSON.parse(originalJson) as Omit<LogDetail, "originalJson">;

  return { ...result, originalJson };
}
