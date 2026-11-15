import { useCallback, useEffect, useRef, useState } from "react";
import { closeLogSnapshot, fetchLogChunk, fetchRunIds, LogSnapshotExpired } from "../api/dashboard";
import type { LogCursor, LogItem, LogQuery } from "../api/dashboard";
import LogDetailPanel from "../components/LogDetailPanel";

const CHUNK_SIZE = 50;
const CACHE_LIMIT = 5;
const ROW_HEIGHT = 64;
const OVERSCAN = 6;
const fieldClass = "mt-1 block h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600";
const buttonClass = "workspace-action disabled:opacity-50";

const filters = [
  { name: "source_id", label: "소스 ID" },
  { name: "mode", label: "파싱 위치", options: [["CENTRAL", "중앙"], ["AGENT", "에이전트"]] },
  { name: "parse_status", label: "파싱 상태", options: [["SUCCESS", "성공"], ["FAILED", "실패"]] },
  { name: "q", label: "원문 검색" },
] as const;

export default function LogViewerPage({ search, onSearch }: {
  search: string;
  onSearch: (params: URLSearchParams) => void;
}) {
  const params = new URLSearchParams(search);
  const runId = params.get("run_id")?.trim() ?? "";
  const refresh = useRef<(() => void) | null>(null);
  const mode = params.get("mode");
  const parseStatus = params.get("parse_status");

  return (
    <>
      <form aria-label="로그 검색" className="log-filters rounded-lg border border-slate-200 bg-white p-4" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const { name } of filters) {
          const value = String(fields.get(name) ?? "").trim();
          if (value) next.set(name, value);
        }
        const selectedRun = String(fields.get("run_id") ?? "").trim();
        if (selectedRun) next.set("run_id", selectedRun);
        next.sort();
        params.sort();
        if (next.toString() === params.toString()) {
          refresh.current?.();
        } else {
          onSearch(next);
        }
      }}>
        <RunIdField initialValue={runId} />
        {filters.map((filter) => (
          <label key={filter.name} className="min-w-0 text-sm font-medium text-slate-700">
            {filter.label}
            {"options" in filter ? (
              <select name={filter.name} className={fieldClass} defaultValue={params.get(filter.name) ?? ""}>
                <option value="">전체</option>
                {filter.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            ) : (
              <input name={filter.name}
                maxLength={filter.name === "q" ? 512 : undefined}
                className={fieldClass} defaultValue={params.get(filter.name) ?? ""} />
            )}
          </label>
        ))}
        <button type="submit" className="h-9 justify-self-start rounded-md bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">검색</button>
      </form>
      <LogResults runId={runId} refresh={refresh}
        sourceId={params.get("source_id")?.trim() ?? ""}
        mode={mode === "CENTRAL" || mode === "AGENT" ? mode : ""}
        parseStatus={parseStatus === "SUCCESS" || parseStatus === "FAILED" ? parseStatus : ""}
        q={params.get("q")?.trim() ?? ""} />
    </>
  );
}

function RunIdField({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [after, setAfter] = useState<string | null>(null);
  const [result, setResult] = useState<{ items: string[]; next_after: string | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await fetchRunIds(value.trim(), after, controller.signal);
        if (!controller.signal.aborted) setResult(next);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : "실행 ID를 조회하지 못했습니다.");
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, value, after]);

  return (
    <div className="relative min-w-0" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        const input = event.currentTarget.querySelector("input");
        input?.focus();
        setOpen(false);
      }
    }}>
      <label className="block text-sm font-medium text-slate-700" htmlFor="run-id">실행 ID</label>
      <input id="run-id" name="run_id" maxLength={512} autoComplete="off" value={value}
        placeholder="전체 실행" className={fieldClass}
        onFocus={() => { setAfter(null); setResult(null); setError(""); setOpen(true); }}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setAfter(null);
          setResult(null);
          setError("");
          setOpen(true);
        }} />
      {open && (
        <div className="absolute z-10 mt-1 w-full min-w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          aria-label="실행 ID 제안">
          <button type="button" className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
            onClick={() => { setValue(""); setOpen(false); }}>전체 실행</button>
          {error && <p className="px-2 py-1 text-sm text-red-700" role="alert">{error}</p>}
          {!error && result === null && <p className="px-2 py-1 text-sm text-slate-500" role="status">조회 중</p>}
          {result && result.items.length === 0 && (
            <p className="px-2 py-1 text-sm text-slate-500">일치하는 실행 ID가 없습니다.</p>
          )}
          <ul className="max-h-56 overflow-auto">
            {result?.items.map((id) => (
              <li key={id}>
                <button type="button" className="w-full break-all rounded px-2 py-1 text-left text-sm hover:bg-indigo-50"
                  onClick={() => { setValue(id); setOpen(false); }}>{id}</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {after !== null && <button type="button" className="px-2 py-1 text-sm text-indigo-700"
              onClick={() => { setResult(null); setError(""); setAfter(null); }}>처음</button>}
            {result?.next_after != null && <button type="button" className="px-2 py-1 text-sm text-indigo-700"
              onClick={() => { setAfter(result.next_after); setResult(null); setError(""); }}>다음 ID</button>}
          </div>
        </div>
      )}
    </div>
  );
}

type SearchWindow = {
  // 메모리에서 제거한 청크는 시작 커서로 다시 불러온다.
  starts: (LogCursor | null)[];
  chunks: Map<number, LogItem[]>;
  discovered: number;
  total: number | null;
};

function emptySearch(): SearchWindow {
  return { starts: [null], chunks: new Map(), discovered: 0, total: null };
}

function LogResults({ runId, sourceId, mode, parseStatus, q, refresh }: LogQuery & {
  runId: string;
  refresh: { current: (() => void) | null };
}) {
  const [live, setLive] = useState(false);
  const [newLogs, setNewLogs] = useState(false);
  const [search, setSearch] = useState(emptySearch);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const [detail, setDetail] = useState<Pick<LogItem, "run_id" | "document_id"> | null>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const pit = useRef<string | null>(null);
  const nearChunk = useRef(0);
  const onRefresh = useCallback(() => {
    const previous = pit.current;
    controller.current?.abort();
    controller.current = null;
    pit.current = null;
    if (previous) void closeLogSnapshot(previous);
    if (list.current) list.current.scrollTop = 0;
    setSearch(emptySearch());
    setError(null);
    setLoading(false);
    setNewLogs(false);
    setDetail(null);
  }, []);
  useEffect(() => {
    refresh.current = onRefresh;
    return () => { refresh.current = null; };
  }, [refresh, onRefresh]);

  const followLive = useRef(false);
  followLive.current = viewport.top === 0 && detail === null && !loading && error === null;

  useEffect(() => {
    const stream = new EventSource("/api/logs/updates");
    let connected = false;
    function notify() {
      if (followLive.current) onRefresh();
      else setNewLogs(true);
    }
    stream.onopen = () => {
      setLive(true);
      if (connected) notify();
      connected = true;
    };
    stream.onerror = () => setLive(false);
    stream.addEventListener("logs", notify);
    return () => stream.close();
  }, [onRefresh]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    function update() {
      if (element) setViewport({ top: element.scrollTop, height: element.clientHeight });
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      controller.current?.abort();
      controller.current = null;
      if (pit.current) void closeLogSnapshot(pit.current);
      pit.current = null;
    };
  }, []);

  const load = useCallback(async (chunkIndex: number, after: LogCursor | null) => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 10_000);
    setLoading(true);
    try {
      const result = await fetchLogChunk(runId, { sourceId, mode, parseStatus, q },
        pit.current, after, request.signal);
      if (controller.current !== request) {
        if (result.pit_id) void closeLogSnapshot(result.pit_id);
        return;
      }
      pit.current = result.pit_id;
      setSearch((current) => {
        const chunks = new Map(current.chunks);
        chunks.set(chunkIndex, result.items);
        if (chunks.size > CACHE_LIMIT) {
          const farthest = [...chunks.keys()].reduce((a, b) =>
            Math.abs(a - nearChunk.current) > Math.abs(b - nearChunk.current) ? a : b);
          chunks.delete(farthest);
        }
        const starts = [...current.starts];
        if (result.next_cursor && chunkIndex + 1 === starts.length) {
          starts.push(result.next_cursor);
        }
        return {
          starts, chunks,
          discovered: Math.max(current.discovered, chunkIndex * CHUNK_SIZE + result.items.length),
          total: result.total_count ?? current.total,
        };
      });
    } catch (failure) {
      if (controller.current !== request) return;
      setError({
        message: request.signal.aborted ? "로그 조회 시간이 초과됐습니다."
          : failure instanceof Error ? failure.message : "로그 조회에 실패했습니다.",
        expired: failure instanceof LogSnapshotExpired,
      });
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, [runId, sourceId, mode, parseStatus, q]);

  const topRow = Math.floor(viewport.top / ROW_HEIGHT);
  const bottomRow = Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT);
  const start = Math.min(search.discovered, Math.max(0, topRow - OVERSCAN));
  const end = Math.min(search.discovered, bottomRow + OVERSCAN);
  const hasMore = search.starts.length * CHUNK_SIZE > search.discovered
    && (search.total === null || search.discovered < search.total);

  useEffect(() => {
    if (newLogs && followLive.current && search.total !== null) {
      onRefresh();
      return;
    }
    const visibleChunk = Math.floor(topRow / CHUNK_SIZE);
    nearChunk.current = visibleChunk;
    if (loading || error || search.total === 0) return;
    if (search.total === null) {
      void load(0, null);
      return;
    }

    for (let index = Math.floor(start / CHUNK_SIZE);
      index <= Math.floor((end - 1) / CHUNK_SIZE); index++) {
      if (!search.chunks.has(index) && index < search.starts.length) {
        void load(index, search.starts[index]);
        return;
      }
    }

    if (hasMore && bottomRow + OVERSCAN >= search.discovered) {
      const next = search.starts.length - 1;
      void load(next, search.starts[next]);
    }
  }, [search, topRow, bottomRow, start, end, hasMore, loading, error, load, newLogs, onRefresh]);

  return (
    <section className="mt-6" aria-label="로그 검색 결과">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700" role="status">
          {search.total === null ? "검색 중" : "총 " + search.total.toLocaleString("ko-KR") + "건"}
          {loading && search.total !== null && " · 불러오는 중"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600">{live ? "실시간 연결됨" : "실시간 연결 대기"}</span>
          <button type="button" className={buttonClass} onClick={onRefresh}>
            {newLogs ? "새 로그 보기" : "검색 새로고침"}
          </button>
        </div>
      </header>
      {error && <div className="mb-3 flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700">{error.message}</p>
        {!error.expired && <button type="button" className={buttonClass} onClick={() => setError(null)}>다시 시도</button>}
      </div>}
      <div className="log-results-body" data-detail={detail !== null || undefined}>
        <div ref={list} aria-label="로그 목록" tabIndex={0}
          className="h-[min(60vh,42rem)] min-h-48 overflow-auto rounded-xl border border-slate-200 bg-white"
          onScroll={(event) => setViewport({
            top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight,
          })}>
          {search.total === 0 && <p className="p-4 text-sm text-slate-600">검색 결과가 없습니다.</p>}
          <div style={{ height: search.discovered * ROW_HEIGHT, position: "relative" }}>
            {Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
              const index = start + offset;
              const item = search.chunks.get(Math.floor(index / CHUNK_SIZE))?.[index % CHUNK_SIZE];
              return (
                <div key={index} style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                  className="absolute inset-x-0 border-b border-slate-100">
                  {item ? <button type="button" onClick={() => setDetail({ document_id: item.document_id, run_id: item.run_id })}
                      className="flex size-full min-w-0 flex-col justify-center gap-1 px-4 text-left hover:bg-indigo-50 aria-pressed:bg-indigo-50"
                      aria-pressed={detail?.document_id === item.document_id}>
                      <span className="flex w-full items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold tabular-nums">{index + 1}.</span>
                        {!runId && <span className="truncate" title={item.run_id}>{item.run_id}</span>}
                        <span className="truncate">{item.source_id}</span>
                        <span className="shrink-0">{item.mode === "CENTRAL" ? "중앙 파싱" : "에이전트 파싱"}</span>
                        <span className={item.parse_status === "FAILED" ? "shrink-0 text-red-700" : "shrink-0 text-emerald-700"}>
                          {item.parse_status === "FAILED" ? "실패" : "성공"}
                        </span>
                      </span>
                      <span className="w-full truncate font-mono text-sm">{item.raw_preview}</span>
                    </button> : <div className="px-4 py-4 text-sm text-slate-500">로그 불러오는 중</div>}
                </div>
              );
            })}
          </div>
          {hasMore && search.total !== null && (
            <button type="button" className="m-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              disabled={loading || error !== null}
              onClick={() => {
                const next = search.starts.length - 1;
                void load(next, search.starts[next]);
              }}>
              다음 로그 불러오기
            </button>
          )}
        </div>
        {detail && <div className="min-w-0 [&>section]:mt-0">
          <LogDetailPanel key={detail.document_id} runId={detail.run_id} documentId={detail.document_id}
            onClose={() => setDetail(null)} />
        </div>}
      </div>
    </section>
  );
}
