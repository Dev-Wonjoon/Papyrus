import { useEffect, useState } from "react";
import { fetchLogDetail } from "../api/dashboard";
import type { LogDetail } from "../api/dashboard";

type Props = {
  runId: string;
  documentId: string;
  onClose: () => void;
};

export default function LogDetailPanel({ runId, documentId, onClose }: Props) {
  const [view, setView] = useState<{
    data: LogDetail | null;
    error: string | null;
  }>({
    data: null,
    error: null,
  });

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
      className="mt-6 rounded-xl border border-indigo-200 bg-white p-5"
    >
      <header className="flex items-center justify-between gap-4">
        <h3 id="detail-heading" className="text-lg font-semibold">
          로그 상세
        </h3>

        <button
          type="button"
          onClick={onClose}
          className="rounded border px-3 py-2 text-sm"
        >
          상세 닫기
        </button>
      </header>

      <p className="mt-3 break-all font-mono text-xs text-slate-500">
        {documentId}
      </p>

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
          <p className="mt-4 text-sm">
            파싱 상태: {String(view.data.document.parse_status ?? "확인 불가")}
          </p>

          <h4 className="mt-5 font-semibold">원문</h4>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-950 p-4 text-sm whitespace-pre-wrap break-all text-slate-100">
            {typeof view.data.document.raw === "string"
              ? view.data.document.raw
              : "원문 필드가 없습니다."}
          </pre>

          <h4 className="mt-5 font-semibold">
            저장 문서 · 파싱 결과와 오류 포함
          </h4>
          <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-100 p-4 text-sm whitespace-pre-wrap break-all">
            {view.data.originalJson}
          </pre>
        </>
      )}
    </section>
  );
}
