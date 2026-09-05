/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { DEFAULT_EMOJIS, hasOptions, QUESTION_TYPE_LABELS } from "../../../shared/types.ts";
import type { Question, QuestionType } from "../../../shared/types.ts";
import { uid } from "../../lib/api.ts";

interface Props {
  q: Question;
  index: number;
  total: number;
  onChange: (q: Question) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}

export function newQuestion(type: QuestionType = "single_choice"): Question {
  const base: Question = {
    id: uid(),
    position: 0,
    type,
    prompt: "",
    options: [],
    isDemographic: false,
    required: false,
    hidden: false,
  };
  if (hasOptions(type)) {
    base.options = type === "emoji_reaction"
      ? DEFAULT_EMOJIS.map((e) => ({ id: uid(), label: e }))
      : [{ id: uid(), label: "" }, { id: uid(), label: "" }];
  }
  if (type === "scale") base.scaleMin = 1, base.scaleMax = 5;
  return base;
}

const Toggle = ({ label, checked, onChange, hint }: any) => (
  <label className="flex items-center gap-2 text-sm cursor-pointer select-none" title={hint}>
    <input type="checkbox" checked={checked} onChange={(e: any) => onChange(e.target.checked)} className="w-4 h-4" />
    {label}
  </label>
);

export function QuestionEditor({ q, index, total, onChange, onMove, onDelete }: Props) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });

  function changeType(type: QuestionType) {
    const fresh = newQuestion(type);
    onChange({ ...fresh, id: q.id, prompt: q.prompt, isDemographic: q.isDemographic, required: q.required, hidden: q.hidden,
      options: hasOptions(type) && hasOptions(q.type) && q.type !== "emoji_reaction" && type !== "emoji_reaction"
        ? q.options
        : fresh.options });
  }

  const canFacet = q.type === "single_choice" || q.type === "multi_choice" || q.type === "scale" ||
    q.type === "emoji_reaction";

  return (
    <div className={`bg-white rounded-xl shadow p-4 border-l-4 ${q.isDemographic ? "border-amber-400" : "border-indigo-400"}`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 text-gray-400">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="hover:text-gray-700 disabled:opacity-20">▲</button>
          <span className="text-xs text-center font-mono">{index + 1}</span>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="hover:text-gray-700 disabled:opacity-20">▼</button>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <select
              value={q.type}
              onChange={(e: any) => changeType(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm bg-gray-50"
            >
              {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="flex gap-3 items-center ml-auto">
              <Toggle label="Required" checked={q.required} onChange={(v: boolean) => set({ required: v })} />
              {canFacet && (
                <Toggle
                  label="Demographic"
                  hint="Use this question to group other results"
                  checked={q.isDemographic}
                  onChange={(v: boolean) => set({ isDemographic: v })}
                />
              )}
              <Toggle label="Hide results" hint="Never show this question's results to the audience" checked={q.hidden} onChange={(v: boolean) => set({ hidden: v })} />
              <button onClick={onDelete} className="text-red-500 hover:text-red-700 text-sm">🗑</button>
            </div>
          </div>

          <input
            value={q.prompt}
            onChange={(e: any) => set({ prompt: e.target.value })}
            placeholder="Question prompt…"
            className="w-full border-b-2 border-gray-200 focus:border-indigo-400 focus:outline-none py-1 text-lg font-medium"
          />

          {hasOptions(q.type) && (
            <div className="space-y-1.5">
              {q.options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm w-5 text-right">{q.type === "ranked_choice" ? "≡" : i + 1}</span>
                  <input
                    value={o.label}
                    onChange={(e: any) =>
                      set({ options: q.options.map((x) => x.id === o.id ? { ...x, label: e.target.value } : x) })}
                    placeholder={q.type === "emoji_reaction" ? "emoji" : `Option ${i + 1}`}
                    className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => set({ options: q.options.filter((x) => x.id !== o.id) })}
                    className="text-gray-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => set({ options: [...q.options, { id: uid(), label: "" }] })}
                className="text-sm text-indigo-600 hover:underline ml-7"
              >
                + add option
              </button>
            </div>
          )}

          {q.type === "scale" && (
            <div className="flex gap-4 items-center text-sm">
              <label>Min <input type="number" value={q.scaleMin ?? 1} onChange={(e: any) => set({ scaleMin: Number(e.target.value) })} className="w-16 border rounded px-2 py-1 ml-1" /></label>
              <label>Max <input type="number" value={q.scaleMax ?? 5} onChange={(e: any) => set({ scaleMax: Number(e.target.value) })} className="w-16 border rounded px-2 py-1 ml-1" /></label>
              <span className="text-gray-400">(e.g. 1–5, 1–10, or 0–10 for NPS)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
