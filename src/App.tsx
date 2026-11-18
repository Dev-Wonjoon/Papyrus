import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import DemoScenarioPanel from "./components/DemoScenarioPanel";
import LogViewerPage from "./pages/LogViewerPage";
import SystemStatusPage from "./pages/SystemStatusPage";

const pages = [
  { path: "/", label: "시연 대시보드" },
  { path: "/status", label: "시스템 상태" },
  { path: "/logs", label: "로그 뷰어" },
] as const;

function readLocation() {
  return { path: window.location.pathname, search: window.location.search };
}

export default function App() {
  const [location, setLocation] = useState(readLocation);
  const [demoRunId, setDemoRunId] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(url: string) {
    if (url === window.location.pathname + window.location.search + window.location.hash) return;
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

  const currentPage = pages.find((page) => page.path === location.path);
  const showOverview = currentPage?.path === "/";
  const showStatus = showOverview || currentPage?.path === "/status";

  return (
    <div className="workspace-shell">
      <a className="workspace-skip" href="#workspace-content">본문으로 건너뛰기</a>
      <aside className="workspace-sidebar" aria-label="Papyrus 탐색">
        <a href="/" onClick={(event) => follow(event, "/")} className="workspace-brand">
          <span className="workspace-mark" aria-hidden="true">P</span>
          Papyrus
        </a>
        <nav aria-label="주 메뉴" className="workspace-nav">
          {pages.map((page) => (
            <a key={page.path} href={page.path} onClick={(event) => follow(event, page.path)}
              aria-current={page === currentPage ? "page" : undefined}>
              {page.label}
            </a>
          ))}
        </nav>
      </aside>
      <main id="workspace-content" className="workspace-main" tabIndex={-1}>
        {currentPage?.path !== "/status" && <header className="workspace-heading">
          <h1>{currentPage?.label ?? "페이지를 찾을 수 없습니다."}</h1>
          {showOverview && <a className="workspace-action" href="#demo">시연으로 이동 <span aria-hidden="true">↓</span></a>}
        </header>}
        {showStatus && (
          <SystemStatusPage onSelectRun={viewRun} demoRunId={demoRunId} overviewMode={showOverview} demo={
            <div id="demo" className="scroll-mt-4" hidden={!showOverview}>
              <DemoScenarioPanel onSelectRun={viewRun} onRunChange={setDemoRunId} />
            </div>
          } />
        )}
        {currentPage?.path === "/logs" && (
          <LogViewerPage key={location.search} search={location.search}
            onSearch={(params) => navigate("/logs?" + params)} />
        )}
      </main>
    </div>
  );
}
