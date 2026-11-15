import { useCallback, useEffect, useRef, useState } from "react";

type PollingState<T> = {
  data: T | null;
  error: string | null;
  isFetching: boolean;
  receivedAt: number | null;
};

type PollingOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { intervalMs = 5000, timeoutMs = 10_000 }: PollingOptions = {},
) {
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
    isFetching: true,
    receivedAt: null,
  });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | undefined;
    let requestTimer: number | undefined;
    let activeController: AbortController | null = null;

    // 조회 대상이 바뀌면 이전 대상의 데이터를 표시하지 않는다.
    setState({
      data: null,
      error: null,
      isFetching: true,
      receivedAt: null,
    });

    async function load() {
      // 수동 갱신과 자동 갱신이 같은 요청을 중복 실행하지 않게 한다.
      if (disposed || activeController !== null) return;

      window.clearTimeout(pollTimer);
      const controller = new AbortController();
      activeController = controller;
      let timedOut = false;

      setState((previous) => ({ ...previous, isFetching: true }));

      try {
        const deadline = new Promise<never>((_, reject) => {
          requestTimer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("조회 시간이 초과했습니다."));
          }, timeoutMs);
        });

        // 취소 신호를 무시하는 조회 함수도 시간 제한 후 대기를 끝낸다.
        const data = await Promise.race([
          fetcher(controller.signal),
          deadline,
        ]);

        if (disposed) return;

        setState({
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

        // 갱신 실패 시에도 마지막 성공 데이터와 수신 시각을 보존한다.
        setState((previous) => ({
          ...previous,
          error: message,
          isFetching: false,
        }));
      } finally {
        window.clearTimeout(requestTimer);
        activeController = null;

        // 요청이 끝난 뒤 다음 조회를 예약한다.
        if (!disposed) {
          pollTimer = window.setTimeout(() => void load(), intervalMs);
        }
      }
    }

    refreshRef.current = () => void load();
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
    ...state,
    isLoading: state.data === null && state.isFetching,
    refresh,
  };
}
