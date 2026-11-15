import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import DemoScenarioPanel from "./components/DemoScenarioPanel";
import LogViewerPage from "./pages/LogViewerPage";
import SystemStatusPage from "./pages/SystemStatusPage";

const pages = [
  { path: "/", label: "시연 대시보드" },
  { path: "/logs", label: "로그 뷰어" },
] as const;

function readLocation() {
  return { path: window.location.pathname, search: window.location.search };
}

export default function App() {
  const [location, setLocation] = useState(readLocation);
  const [demoRunId, setDemoRunId] = useState<string | null>(null);

  useEffect(() => {
    if (location.path === "/status") {
      document.getElementById("system-status")?.scrollIntoView();
    }
  }, [location.path]);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(url: string) {
    if (url === window.location.pathname + window.location.search) return;
    window.history.pushState(null, "", url);
    setLocation(readLocation());
    window.scrollTo(0, 0);
  }

  function follow(event: MouseEvent<HTMLAnchorElement>, url: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    navigate(url);
  }

  function viewRun(runId: string) {
    navigate("/logs?" + new URLSearchParams({ run_id: runId }));
  }

  const pagePath = location.path === "/status" ? "/" : location.path;
  const currentPage = pages.find((page) => page.path === pagePath);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-8">
          <a href="/" onClick={(event) => follow(event, "/")} className="text-sm font-bold tracking-[0.2em] text-indigo-700">
            SESHAT
          </a>
          <nav aria-label="주 메뉴" className="flex flex-wrap gap-1">
            {pages.map((page) => (
              <a key={page.path} href={page.path} onClick={(event) => follow(event, page.path)}
                aria-current={page === currentPage ? "page" : undefined}
                className={
                  page === currentPage
                    ? "rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800"
                    : "rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                }>
                {page.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        {currentPage?.path === "/" && (
          <>
            <h1 className="mb-6 text-3xl font-bold tracking-tight">로그 수집 시연</h1>
            <DemoScenarioPanel onSelectRun={viewRun} onRunChange={setDemoRunId} />
            <SystemStatusPage onSelectRun={viewRun} demoRunId={demoRunId} />
          </>
        )}
        {currentPage?.path === "/logs" && (
          <LogViewerPage key={location.search} search={location.search}
            onSearch={(params) => navigate("/logs?" + params)} />
        )}
        {!currentPage && <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다.</h1>}
      </main>
    </div>
  );
}
