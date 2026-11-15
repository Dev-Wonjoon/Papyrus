import { useCallback, useEffect, useRef, useState } from "react";

type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

type PollingState<T> = {
  fetcher: Fetcher<T>;
  data: T | null;
  error: string | null;
  isFetching: boolean;
  receivedAt: number | null;
};

type PollingOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

function initialState<T>(fetcher: Fetcher<T>): PollingState<T> {
  return {
    fetcher,
    data: null,
    error: null,
    isFetching: true,
    receivedAt: null,
  };
}

export function usePolling<T>(
  fetcher: Fetcher<T>,
  { intervalMs = 5000, timeoutMs = 10_000 }: PollingOptions = {},
) {
  const [state, setState] = useState(() => initialState(fetcher));
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  // 조회 대상이 달라지면 이전 대상의 데이터를 노출하지 않는다.
  const current = state.fetcher === fetcher ? state : initialState(fetcher);

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | undefined;
    let requestTimer: number | undefined;
    let activeController: AbortController | null = null;

    async function load() {
      // 진행 중인 요청이 있으면 중복 실행하지 않는다.
      if (disposed || activeController !== null) return;

      window.clearTimeout(pollTimer);

      const controller = new AbortController();
      activeController = controller;
      let timedOut = false;

      setState((previous) =>
        previous.fetcher === fetcher
          ? { ...previous, isFetching: true }
          : initialState(fetcher),
      );

      try {
        const deadline = new Promise<never>((_, reject) => {
          requestTimer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("조회 시간이 초과했습니다."));
          }, timeoutMs);
        });

        const data = await Promise.race([fetcher(controller.signal), deadline]);

        if (disposed) return;

        // 제한 시간이 지난 응답은 성공 데이터로 반영하지 않는다.
        if (timedOut) {
          throw new Error("조회 시간이 초과했습니다.");
        }

        setState({
          fetcher,
          data,
          error: null,
          isFetching: false,
          receivedAt: performance.now(),
        });
      } catch (error) {
        if (disposed) return;

        const message = timedOut
          ? "조회 시간이 초과했습니다. 서버 연결을 확인해 주세요."
          : error instanceof TypeError
            ? "서버에 연결하지 못했습니다. 백엔드 실행 상태를 확인해 주세요."
            : error instanceof Error
              ? error.message
              : "데이터를 조회하지 못했습니다.";

        // 마지막 성공 데이터와 수신 시각을 그대로 보존한다.
        setState((previous) => ({
          ...(previous.fetcher === fetcher ? previous : initialState(fetcher)),
          error: message,
          isFetching: false,
        }));
      } finally {
        window.clearTimeout(requestTimer);
        activeController = null;

        if (!disposed) {
          pollTimer = window.setTimeout(() => {
            void load();
          }, intervalMs);
        }
      }
    }

    refreshRef.current = () => {
      void load();
    };

    void load();

    return () => {
      disposed = true;
      refreshRef.current = () => {};
      window.clearTimeout(pollTimer);
      window.clearTimeout(requestTimer);
      activeController?.abort();
    };
  }, [fetcher, intervalMs, timeoutMs]);

  return {
    data: current.data,
    error: current.error,
    receivedAt: current.receivedAt,
    isFetching: current.isFetching,
    isLoading: current.data === null && current.isFetching,
    refresh,
  };
}
