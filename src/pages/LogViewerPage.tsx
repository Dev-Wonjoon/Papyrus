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
] as const;

export default function LogViewerPage({ search, onSearch }: {
  search: string;
  onSearch: (params: URLSearchParams) => void;
}) {
  const params = new URLSearchParams(search);
  const runId = params.get("run_id")?.trim() ?? "";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const refresh = useRef<(() => void) | null>(null);
  const mode = params.get("mode");
  const parseStatus = params.get("parse_status");
  const extraCount = filters.filter(({ name }) => params.get(name)?.trim()).length;

  return (
    <>
      <form aria-label="로그 검색" className="log-filters" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const name of ["run_id", ...filters.map((filter) => filter.name), "q"]) {
          const value = String(fields.get(name) ?? "").trim();
          if (value) next.set(name, value);
        }
        next.sort();
        params.sort();
        if (next.toString() === params.toString()) {
          refresh.current?.();
        } else {
          onSearch(next);
        }
      }}>
        <RunIdField initialValue={runId} />
        <label className="log-raw-filter min-w-0 text-sm font-medium text-slate-700">
          원문 검색
          <input name="q" maxLength={512} className={fieldClass} defaultValue={params.get("q") ?? ""} />
        </label>
        <button type="button" className="workspace-action log-filter-toggle"
          aria-expanded={filtersOpen} aria-controls="log-extra-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}>
          추가 필터{extraCount > 0 && ` (${extraCount})`}
        </button>
        <div id="log-extra-filters" className="log-extra-filters" data-open={filtersOpen || undefined}>
          {filters.map((filter) => (
            <label key={filter.name} className="min-w-0 text-sm font-medium text-slate-700">
              {filter.label}
              {"options" in filter ? (
                <select name={filter.name} className={fieldClass} defaultValue={params.get(filter.name) ?? ""}>
                  <option value="">전체</option>
                  {filter.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              ) : (
                <input name={filter.name} className={fieldClass} defaultValue={params.get(filter.name) ?? ""} />
              )}
            </label>
          ))}
        </div>
        <button type="submit" className="log-submit workspace-action workspace-primary-action">검색</button>
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

function LogIdCopy({ label, value, onCopy }: {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => Promise<void>;
}) {
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span className="truncate font-mono" title={value}>{value}</span>
      <button type="button" aria-label={`${label} 복사`} title={`${label} 복사`}
        className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600"
        onClick={() => void onCopy(label, value)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
          className="size-3.5">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      </button>
    </span>
  );
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
  const [copyNotice, setCopyNotice] = useState("");
  const copyNoticeTimer = useRef<number>(undefined);
  const list = useRef<HTMLDivElement>(null);
  const detailOrigin = useRef<{ row: HTMLButtonElement; listTop: number; pageTop: number } | null>(null);
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
    detailOrigin.current = null;
  }, []);
  useEffect(() => {
    refresh.current = onRefresh;
    return () => { refresh.current = null; };
  }, [refresh, onRefresh]);
  useEffect(() => () => window.clearTimeout(copyNoticeTimer.current), []);

  async function copyLogId(label: string, value: string) {
    let message = `${label}를 복사했습니다.`;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      message = `${label}를 복사하지 못했습니다.`;
    }
    window.clearTimeout(copyNoticeTimer.current);
    setCopyNotice(message);
    copyNoticeTimer.current = window.setTimeout(() => setCopyNotice(""), 2500);
  }

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

  function closeDetail() {
    const origin = detailOrigin.current;
    detailOrigin.current = null;
    setDetail(null);
    if (!origin) return;
    requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = origin.listTop;
      (origin.row.isConnected ? origin.row : list.current)?.focus({ preventScroll: true });
      window.scrollTo(0, origin.pageTop);
    });
  }

  return (
    <section className="mt-4" aria-label="로그 검색 결과">
      <div role="status" className="pointer-events-none fixed right-4 bottom-4 z-30">
        {copyNotice && <p className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">{copyNotice}</p>}
      </div>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700" role="status">
          {search.total === null ? (error ? "검색 실패" : "검색 중")
            : "총 " + search.total.toLocaleString("ko-KR") + "건"}
          {loading && search.total !== null && " · 불러오는 중"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${live ? "bg-emerald-600" : "bg-slate-400"}`} />
            {live ? "실시간 연결됨" : "실시간 연결 대기"}
          </span>
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
        <div ref={list} role="region" aria-label="로그 목록" tabIndex={0}
          className="log-list"
          data-compact={search.discovered === 0 || undefined}
          data-unavailable={error !== null && search.discovered === 0 || undefined}
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
                  {item ? <>
                    <button type="button" className="log-row absolute inset-0"
                      aria-label={`${index + 1}번 로그 상세 열기`}
                      aria-pressed={detail?.document_id === item.document_id && detail?.run_id === item.run_id}
                      onClick={(event) => {
                        detailOrigin.current = {
                          row: event.currentTarget,
                          listTop: list.current?.scrollTop ?? 0,
                          pageTop: window.scrollY,
                        };
                        setDetail({ document_id: item.document_id, run_id: item.run_id });
                      }} />
                    <div className="pointer-events-none relative grid h-full min-w-0 content-center px-3">
                      <span className="log-row-meta" data-all-runs>
                        <span className="text-slate-500 tabular-nums">{index + 1}</span>
                        <LogIdCopy label="실행 ID" value={item.run_id} onCopy={copyLogId} />
                        <LogIdCopy label="소스 ID" value={item.source_id} onCopy={copyLogId} />
                        <span className="shrink-0">{item.mode === "CENTRAL" ? "중앙 파싱" : "에이전트 파싱"}</span>
                        <span className={item.parse_status === "FAILED" ? "shrink-0 text-red-700" : "shrink-0 text-emerald-700"}>
                          {item.parse_status === "FAILED" ? "실패" : "성공"}
                        </span>
                      </span>
                      <span className="truncate font-mono text-sm">{item.raw_preview}</span>
                    </div>
                  </> : <div className="px-4 py-4 text-sm text-slate-500">로그 불러오는 중</div>}
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
        {detail && <div className="log-detail">
          <LogDetailPanel key={JSON.stringify([detail.run_id, detail.document_id])}
            runId={detail.run_id} documentId={detail.document_id} onClose={closeDetail} />
        </div>}
      </div>
    </section>
  );
}
