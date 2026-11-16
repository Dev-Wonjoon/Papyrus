import { useEffect, useRef, useState } from "react";
import { fetchLogDetail } from "../api/dashboard";
import type { LogDetail } from "../api/dashboard";

type Props = {
  runId: string;
  documentId: string;
  onClose: () => void;
};

const PREVIEW_LIMIT = 4096;

function textPreview(text: string) {
  let end = 0;
  let characters = 0;
  for (const character of text) {
    if (characters === PREVIEW_LIMIT) break;
    end += character.length;
    characters += 1;
  }
  return { text: text.slice(0, end), truncated: end < text.length };
}

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export default function LogDetailPanel({ runId, documentId, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<{
    data: LogDetail | null;
    error: string | null;
  }>({
    data: null,
    error: null,
  });

  useEffect(() => {
    const title = heading.current;
    if (!title) return;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);

    async function load() {
      try {
        const data = await fetchLogDetail(runId, documentId, controller.signal);

        if (active) setView({ data, error: null });
      } catch (error) {
        if (!active) return;

        const message = controller.signal.aborted
          ? "상세 조회 시간이 초과했습니다."
          : error instanceof TypeError
            ? "서버에 연결하지 못했습니다."
            : error instanceof Error
              ? error.message
              : "로그 상세를 조회하지 못했습니다.";

        setView({ data: null, error: message });
      } finally {
        window.clearTimeout(timer);
      }
    }

    void load();

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [runId, documentId]);

  const rawField = view.data?.document.raw;
  const raw = typeof rawField === "string" ? rawField : null;
  const originalJson = view.data?.originalJson ?? null;
  const rawPreview = raw === null ? null : textPreview(raw);
  const jsonPreview = originalJson === null ? null : textPreview(originalJson);

  return (
    <section
      aria-labelledby="detail-heading"
      className="console-panel"
    >
      <header className="flex items-center justify-between gap-4">
        <h3 id="detail-heading" ref={heading} tabIndex={-1} className="text-lg font-semibold">
          로그 상세
        </h3>

        <button
          type="button"
          onClick={onClose}
          className="workspace-action"
        >
          상세 닫기
        </button>
      </header>

      {view.data === null && view.error === null && (
        <p role="status" className="mt-4">
          상세를 조회하고 있습니다.
        </p>
      )}

      {view.error !== null && (
        <p role="alert" className="mt-4 text-red-700">
          {view.error} 상세를 닫고 다시 열어 재시도할 수 있습니다.
        </p>
      )}

      {view.data !== null && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">원문</h4>
            {raw !== null && (
              <button type="button" className="workspace-action"
                onClick={() => downloadText(raw, `seshat-${documentId}.log`, "text/plain;charset=utf-8")}>
                원문 다운로드
              </button>
            )}
          </div>
          {rawPreview?.truncated && (
            <p className="mt-1 text-xs text-slate-600">처음 4,096자 표시. 전체 원문은 다운로드할 수 있습니다.</p>
          )}
          <pre tabIndex={0} className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap break-words">
            {rawPreview?.text ?? "원문 필드가 없습니다."}
          </pre>

          <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">문서 ID</dt>
              <dd className="font-mono break-all">{documentId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">파싱 상태</dt>
              <dd>{view.data.document.parse_status === "SUCCESS" ? "성공"
                : view.data.document.parse_status === "FAILED" ? "실패"
                : String(view.data.document.parse_status ?? "확인 불가")}</dd>
            </div>
          </dl>
          <details className="mt-3 rounded-md border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
              저장 문서 · 파싱 결과와 오류
            </summary>
            {originalJson !== null && jsonPreview !== null && (
              <div className="border-t border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {jsonPreview.truncated && (
                    <p className="text-xs text-slate-600">처음 4,096자 표시.</p>
                  )}
                  <button type="button" className="workspace-action"
                    onClick={() => downloadText(originalJson, `seshat-${documentId}.json`, "application/json;charset=utf-8")}>
                    JSON 다운로드
                  </button>
                </div>
                <pre tabIndex={0} className="mt-2 max-h-96 overflow-auto text-sm whitespace-pre-wrap break-words">
                  {jsonPreview.text}
                </pre>
              </div>
            )}
          </details>
        </>
      )}
    </section>
  );
}
