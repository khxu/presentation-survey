/** @jsxImportSource https://esm.sh/react@18.2.0 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "https://esm.sh/react@18.2.0";
import type { ProposalsPayload } from "../../shared/types.ts";

export function useProposals(
  fetcher: (signal: AbortSignal) => Promise<ProposalsPayload>,
) {
  const [data, setData] = useState<ProposalsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);

  const refresh = useCallback(async () => {
    if (!active.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const next = await fetcher(request.signal);
      if (!request.signal.aborted) {
        setData(next);
        setError(null);
      }
    } catch (error) {
      if (!request.signal.aborted) {
        setError(
          error instanceof Error ? error.message : "Could not load proposals.",
        );
      }
    } finally {
      if (controller.current === request) controller.current = null;
    }
  }, [fetcher]);

  useEffect(() => {
    active.current = true;
    setData(null);
    void refresh();
    const timer = setInterval(() => {
      if (!controller.current && document.visibilityState === "visible") {
        void refresh();
      }
    }, 5000);
    return () => {
      clearInterval(timer);
      active.current = false;
      controller.current?.abort();
    };
  }, [refresh]);

  return { data, error, refresh };
}
