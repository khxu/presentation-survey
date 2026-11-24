import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BIAT_CATEGORIES, biatFocal, isBiatComplete } from "../../../shared/biat.ts";
import type {
  BiatAttempt,
  BiatConfig,
  BiatSchedule,
  BiatTrialResult,
} from "../../../shared/types.ts";
import { api } from "../../lib/api.ts";

interface Props {
  slug: string;
  questionId: string;
  config: BiatConfig;
  onComplete: () => void;
}

type Run =
  | { phase: "intro" }
  | { phase: "block"; schedule: BiatSchedule; block: number }
  | { phase: "trial"; schedule: BiatSchedule; block: number; trial: number }
  | { phase: "submit"; attempt: BiatAttempt };

const primaryActionCls =
  "w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-white font-semibold py-3.5 px-5 rounded-xl text-lg shadow-sm border-2 border-indigo-700 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2";

const sortButtonCls =
  "min-h-[4.5rem] rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 px-3 py-3 font-semibold text-indigo-900 shadow-sm transition cursor-pointer touch-manipulation focus:outline-none focus:ring-2 focus:ring-indigo-400";

const kbdCls =
  "inline-block px-1.5 py-0.5 text-xs font-mono font-semibold bg-white text-gray-700 border border-gray-300 rounded shadow-sm";

export function BiatInput({ slug, questionId, config, onComplete }: Props) {
  const [run, setRun] = useState<Run>({ phase: "intro" });
  const [visibleRun, setVisibleRun] = useState<Run | null>(null);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const results = useRef<BiatTrialResult[][]>([[], []]);
  const onset = useRef<number | null>(null);
  const initialLatency = useRef<number | null>(null);
  const started = useRef(false);
  const request = useRef(false);
  const alive = useRef(true);
  const taskRef = useRef<HTMLDivElement>(null);
  const ready = visibleRun === run;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    function interrupt() {
      if (!document.hidden || !started.current) return;
      started.current = false;
      onset.current = null;
      setVisibleRun(null);
      setWrong(false);
      setError("The test was interrupted when you left this tab. Restart to try again.");
      setRun({ phase: "intro" });
    }
    document.addEventListener("visibilitychange", interrupt);
    return () => document.removeEventListener("visibilitychange", interrupt);
  }, []);

  useLayoutEffect(() => {
    if (run.phase !== "trial") return;
    onset.current = null;
    initialLatency.current = null;
    setWrong(false);
    let frame = 0;
    const gap = window.setTimeout(() => {
      frame = requestAnimationFrame(() => {
        setVisibleRun(run);
      });
    }, run.trial === 0 ? 0 : 250);
    return () => {
      window.clearTimeout(gap);
      cancelAnimationFrame(frame);
    };
  }, [run]);

  useLayoutEffect(() => {
    if (ready) onset.current = performance.now();
  }, [ready]);

  async function load() {
    if (request.current) return;
    request.current = true;
    setBusy(true);
    setError("");
    try {
      const schedule = await api.biatSchedule(slug, questionId);
      if (!alive.current) return;
      if (isBiatComplete(schedule)) onComplete();
      else {
        results.current = [[], []];
        setRun({ phase: "block", schedule, block: 0 });
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      request.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function submit(attempt: BiatAttempt) {
    if (request.current) return;
    request.current = true;
    setBusy(true);
    setError("");
    try {
      await api.submitBiat(slug, questionId, attempt);
      if (alive.current) onComplete();
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      request.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const block = run.phase === "trial" || run.phase === "block"
    ? run.schedule.blocks[run.block]
    : undefined;
  const trial = run.phase === "trial" ? block?.trials[run.trial] : undefined;

  function respond(focal: boolean, input: BiatTrialResult["input"]) {
    if (run.phase !== "trial" || !block || !trial || !ready ||
      onset.current === null || document.hidden) return;
    const latencyMs = Math.round(performance.now() - onset.current);
    initialLatency.current ??= latencyMs;
    if (focal !== biatFocal(trial.category, block.target)) {
      setWrong(true);
      return;
    }
    onset.current = null;
    results.current[run.block].push({ ...trial, latencyMs, initialLatencyMs: initialLatency.current, input });
    if (run.trial + 1 < block.trials.length) {
      setRun({ ...run, trial: run.trial + 1 });
    } else if (run.block + 1 < run.schedule.blocks.length) {
      setRun({ phase: "block", schedule: run.schedule, block: run.block + 1 });
    } else {
      started.current = false;
      const attempt = { version: run.schedule.version, blocks: results.current };
      setRun({ phase: "submit", attempt });
      void submit(attempt);
    }
  }

  return (
    <div
      ref={taskRef}
      tabIndex={-1}
      className="space-y-3"
      onKeyDown={(event) => {
        const key = event.key.toLowerCase();
        if (key !== "e" && key !== "i") return;
        if (run.phase !== "trial" || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        if (!event.repeat) respond(key === "i", "keyboard");
      }}
    >
      {run.phase === "intro" && <>
        <p>Sort words as quickly and accurately as you can. There are two short rounds.</p>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {BIAT_CATEGORIES.map((category) => (
            <li key={category} className="bg-gray-100 rounded-lg p-2">
              <strong>{config[category].label}</strong>: {config[category].stimuli.join(", ")}
            </li>
          ))}
        </ul>
        <button type="button" disabled={busy} className={primaryActionCls} onClick={() => void load()}>
          {busy ? "Loading…" : "Start Brief IAT →"}
        </button>
      </>}
      {block && (run.phase === "block" || run.phase === "trial") && <>
        <p className="text-sm font-medium text-gray-600">Round {run.block + 1} of {run.schedule.blocks.length}</p>
        {run.phase === "block" ? <>
          <p>
            Choose <strong>{config[block.target].label} or {config.focalAttribute.label}</strong> for
            words from either of those categories, and <strong>Everything else</strong> for other words.
            Use the buttons or press <kbd className={kbdCls}>E</kbd> for everything else and{" "}
            <kbd className={kbdCls}>I</kbd> for the pair.
            If you make a mistake, choose the other answer.
          </p>
          <button type="button" className={primaryActionCls} onClick={() => {
            if (document.hidden) return;
            started.current = true;
            setRun({ ...run, phase: "trial", trial: 0 });
            taskRef.current?.focus();
          }}>
            Start round {run.block + 1} →
          </button>
        </> : <>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={sortButtonCls}
              onClick={(e) => respond(false, e.detail === 0 ? "keyboard" : "pointer")}>
              Everything else <kbd className={kbdCls}>E</kbd>
            </button>
            <button type="button" className={sortButtonCls}
              onClick={(e) => respond(true, e.detail === 0 ? "keyboard" : "pointer")}>
              {config[block.target].label} or {config.focalAttribute.label} <kbd className={kbdCls}>I</kbd>
            </button>
          </div>
          <div className="min-h-[6rem] flex flex-col items-center justify-center break-all text-center" aria-live="polite">
            {ready && trial && <strong className="text-2xl">{config[trial.category].stimuli[trial.stimulus]}</strong>}
            {wrong && <p className="text-red-700 font-medium">Try the other answer.</p>}
          </div>
        </>}
      </>}
      {run.phase === "submit" && (
        busy ? <p role="status">Saving your completed test…</p> : (
          <button type="button" className={primaryActionCls} onClick={() => void submit(run.attempt)}>
            Retry saving your test
          </button>
        )
      )}
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
