/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type {
  AnswerValue,
  Question,
  SpectrumLabels,
} from "../../../shared/types.ts";
import {
  DEFAULT_SPECTRUM_LABELS,
  normalizeSpectrumAnswer,
} from "../../../shared/questions.ts";
import { spectrumAnswerStage } from "../../lib/respondFlow.ts";

export function describeSpectrumPosition(
  value: number,
  labels: SpectrumLabels,
): string {
  const distance = Math.abs(value - 50);
  if (distance <= 5) {
    return `Your choice indicates a neutral or mixed position between "${labels.left}" and "${labels.right}".`;
  }
  const strength = distance <= 10
    ? "slightly"
    : distance <= 25
    ? "moderately"
    : "strongly";
  return `Your choice indicates you are ${strength} toward "${
    value < 50 ? labels.left : labels.right
  }".`;
}

export function SpectrumInput(
  { q, value, savedValue, onChange }: {
    q: Question;
    value: AnswerValue | undefined;
    savedValue: AnswerValue | undefined;
    onChange: (value: AnswerValue) => void;
  },
) {
  const answer = normalizeSpectrumAnswer(value) ?? {};
  const saved = normalizeSpectrumAnswer(savedValue);
  const stage = spectrumAnswerStage(q, savedValue);
  const selected = answer[stage];
  const labels = q.spectrumLabels ?? DEFAULT_SPECTRUM_LABELS;
  const description = selected === undefined
    ? `Choose a position between "${labels.left}" (0) and "${labels.right}" (100). The centered slider is not a vote until you choose.`
    : describeSpectrumPosition(selected, labels);
  const choose = (position: number) =>
    onChange({
      ...answer,
      ...(stage === "after" ? { before: saved!.before } : {}),
      [stage]: position,
    });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">
        {stage === "before" ? "Before the session" : "After the session"}
      </h3>
      {q.spectrumPhase === "after" && stage === "before" && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">
          Joined late? Recall your position before the session first. Once
          saved, it cannot be changed; then record your position now.
        </p>
      )}
      {stage === "after" && (
        <p className="text-sm text-gray-600">
          Your before position: <strong>{saved!.before}/100</strong> (frozen).
        </p>
      )}
      <label className="block">
        <span className="block text-sm text-gray-600 mb-3">
          Your {stage} position:{" "}
          <strong>
            {selected === undefined ? "not selected" : `${selected}/100`}
          </strong>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={selected ?? 50}
          aria-label={`${
            stage === "before" ? "Before" : "After"
          } position: ${labels.left} to ${labels.right}`}
          aria-valuetext={selected === undefined
            ? "Not selected; move the slider or choose the midpoint"
            : `${selected} out of 100. ${description}`}
          aria-describedby={`spectrum-context-${q.id}`}
          onChange={(event) => choose(Number(event.currentTarget.value))}
          className="w-full h-10 accent-indigo-600 cursor-pointer"
        />
      </label>
      <div className="flex justify-between gap-4 text-sm font-semibold">
        <span className="break-words min-w-0">0 · {labels.left}</span>
        <span className="break-words min-w-0 text-right">
          100 · {labels.right}
        </span>
      </div>
      <p
        id={`spectrum-context-${q.id}`}
        className="text-sm text-indigo-900 bg-indigo-50 rounded-lg p-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {description}
      </p>
      {selected === undefined && (
        <button
          type="button"
          onClick={() => choose(50)}
          className="border border-indigo-300 rounded-lg px-4 py-2 text-indigo-700"
        >
          Choose midpoint (50)
        </button>
      )}
      <p className="text-xs text-gray-500">
        {stage === "before"
          ? "Your before position freezes when after responses open."
          : "You can update your after position while the survey is open."}
      </p>
    </div>
  );
}
