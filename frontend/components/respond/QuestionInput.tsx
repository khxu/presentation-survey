/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useState } from "https://esm.sh/react@18.2.0";
import type { AnswerValue, Question } from "../../../shared/types.ts";

interface Props {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue | undefined) => void;
}

const choiceCls = (on: boolean) =>
  `w-full text-left px-5 py-4 rounded-xl border-2 text-lg transition active:scale-[0.98] ${
    on
      ? "border-indigo-600 bg-indigo-50 font-semibold"
      : "border-gray-200 bg-white hover:border-indigo-300"
  }`;

export function QuestionInput({ q, value, onChange }: Props) {
  switch (q.type) {
    case "single_choice":
      return (
        <div className="space-y-3">
          {q.options.map((o) => (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={choiceCls(value === o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case "multi_choice": {
      const sel = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-3">
          {q.options.map((o) => {
            const on = sel.includes(o.id);
            return (
              <button
                key={o.id}
                onClick={() =>
                  onChange(on ? sel.filter((x) => x !== o.id) : [...sel, o.id])}
                className={choiceCls(on)}
              >
                <span className="mr-2">{on ? "☑" : "☐"}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }

    case "scale": {
      const min = q.scaleMin ?? 1, max = q.scaleMax ?? 5;
      const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const wide = nums.length > 7;
      return (
        <div className={`grid gap-2 ${wide ? "grid-cols-6" : "grid-cols-5"}`}>
          {nums.map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`aspect-square rounded-xl border-2 text-xl font-bold transition ${
                value === n
                  ? "border-indigo-600 bg-indigo-600 text-white scale-105"
                  : "border-gray-200 bg-white hover:border-indigo-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }

    case "free_text":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e: any) => onChange(e.target.value || undefined)}
          rows={4}
          placeholder="Type your answer…"
          className="w-full border-2 border-gray-200 focus:border-indigo-400 focus:outline-none rounded-xl p-4 text-lg"
        />
      );

    case "word_cloud":
      return (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e: any) => onChange(e.target.value || undefined)}
          maxLength={40}
          placeholder="One word or short phrase"
          className="w-full border-2 border-gray-200 focus:border-indigo-400 focus:outline-none rounded-xl p-4 text-2xl text-center"
        />
      );

    case "emoji_reaction":
      return (
        <div className="grid grid-cols-3 gap-3">
          {q.options.map((o) => (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`aspect-square rounded-2xl border-2 text-5xl transition ${
                value === o.id
                  ? "border-indigo-600 bg-indigo-50 scale-110"
                  : "border-gray-200 bg-white hover:scale-105"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case "ranked_choice":
      return (
        <RankedInput
          q={q}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      );
  }
}

/** Tap-to-rank + arrows (works well on phones; HTML5 drag is flaky on touch). */
function RankedInput(
  { q, value, onChange }: {
    q: Question;
    value: string[];
    onChange: (v: string[]) => void;
  },
) {
  const ranked = value.filter((id) => q.options.some((o) => o.id === id));
  const unranked = q.options.filter((o) => !ranked.includes(o.id));
  const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
  const [drag, setDrag] = useState<number | null>(null);

  const move = (i: number, j: number) => {
    if (j < 0 || j >= ranked.length) return;
    const arr = [...ranked];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          Your ranking (1 = favorite)
        </div>
        {ranked.length === 0 && (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center text-gray-400 text-sm">
            Tap options below to rank them
          </div>
        )}
        <div className="space-y-2">
          {ranked.map((id, i) => (
            <div
              key={id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e: any) => e.preventDefault()}
              onDrop={() => {
                if (drag !== null && drag !== i) {
                  const arr = [...ranked];
                  const [m] = arr.splice(drag, 1);
                  arr.splice(i, 0, m);
                  onChange(arr);
                }
                setDrag(null);
              }}
              className="flex items-center gap-3 bg-indigo-50 border-2 border-indigo-300 rounded-xl px-3 py-3"
            >
              <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 font-medium">{label(id)}</span>
              <button
                onClick={() => move(i, i - 1)}
                className="text-gray-500 px-1 disabled:opacity-20"
                disabled={i === 0}
              >
                ▲
              </button>
              <button
                onClick={() => move(i, i + 1)}
                className="text-gray-500 px-1 disabled:opacity-20"
                disabled={i === ranked.length - 1}
              >
                ▼
              </button>
              <button
                onClick={() => onChange(ranked.filter((x) => x !== id))}
                className="text-gray-400 hover:text-red-500 px-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      {unranked.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Not yet ranked
          </div>
          <div className="space-y-2">
            {unranked.map((o) => (
              <button
                key={o.id}
                onClick={() => onChange([...ranked, o.id])}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 bg-white hover:border-indigo-300"
              >
                <span className="text-gray-400 mr-2">+</span>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
