import { useEffect, useRef, useState } from "react";
import { fetchLogDetail } from "../api/dashboard";
import type { LogDetail } from "../api/dashboard";

type Props = {
  runId: string;
  documentId: string;
  onClose: () => void;
};

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
          <h4 className="mt-3 text-sm font-semibold">원문</h4>
          <pre tabIndex={0} className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap break-words">
            {typeof view.data.document.raw === "string"
              ? view.data.document.raw
              : "원문 필드가 없습니다."}
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
            <pre tabIndex={0} className="max-h-96 overflow-auto border-t border-slate-200 p-3 text-sm whitespace-pre-wrap break-words">
              {view.data.originalJson}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
