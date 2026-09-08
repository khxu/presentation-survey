/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useState } from "https://esm.sh/react@18.2.0";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "https://esm.sh/recharts@2.12.7?deps=react@18.2.0,react-dom@18.2.0";
import type {
  FacetGroup,
  Question,
  QuestionAggregate,
} from "../../../shared/types.ts";

export const PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
  "#84cc16",
];

const optLabel = (q: Question, id: string) =>
  q.options.find((o) => o.id === id)?.label ?? id;

/* ---------------- Choice / emoji: bars, grouped by facet when present ---------------- */
export function ChoiceChart(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const faceted = groups.length > 1;
  const data = q.options.map((o) => {
    const row: Record<string, string | number> = { name: o.label };
    for (const g of groups) row[g.label] = agg(g, q.id)?.counts?.[o.id] ?? 0;
    return row;
  });
  const height = Math.max(
    160,
    q.options.length * (faceted ? 28 * groups.length + 16 : 44),
  );

  if (q.type === "emoji_reaction" && !faceted) {
    return <EmojiBubbles q={q} agg={agg(groups[0], q.id)} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          tick={{ fontSize: 14 }}
        />
        <Tooltip cursor={{ fill: "rgba(99,102,241,0.06)" }} />
        {faceted && <Legend />}
        {groups.map((g, i) => (
          <Bar
            key={g.key}
            dataKey={g.label}
            fill={PALETTE[i % PALETTE.length]}
            radius={[0, 8, 8, 0]}
            isAnimationActive
            animationDuration={600}
          >
            {!faceted &&
              data.map((_, j) => (
                <Cell key={j} fill={PALETTE[j % PALETTE.length]} />
              ))}
            <LabelList
              dataKey={g.label}
              position="right"
              style={{ fontWeight: 700, fontSize: 14 }}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmojiBubbles({ q, agg }: { q: Question; agg?: QuestionAggregate }) {
  const counts = agg?.counts ?? {};
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="flex flex-wrap items-end justify-center gap-6 py-4 min-h-[160px]">
      {q.options.map((o, i) => {
        const n = counts[o.id] ?? 0;
        const size = 40 + (n / max) * 80;
        return (
          <div
            key={o.id}
            className="flex flex-col items-center"
            style={{
              animation: `float ${
                2 + (i % 3) * 0.4
              }s ease-in-out infinite alternate`,
            }}
          >
            <span
              style={{
                fontSize: size,
                lineHeight: 1,
                transition: "font-size .6s cubic-bezier(.34,1.56,.64,1)",
              }}
            >
              {o.label}
            </span>
            <span className="text-lg font-bold text-gray-600 mt-1">{n}</span>
          </div>
        );
      })}
      <style>
        {`@keyframes float{from{transform:translateY(0)}to{transform:translateY(-8px)}}`}
      </style>
    </div>
  );
}

/* ---------------- Scale: histogram (+ per-group overlay) & mean ---------------- */
export function ScaleChart(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const min = q.scaleMin ?? 1, max = q.scaleMax ?? 5;
  const data: Record<string, string | number>[] = [];
  for (let i = min; i <= max; i++) {
    const row: Record<string, string | number> = { name: String(i) };
    for (const g of groups) {
      row[g.label] = agg(g, q.id)?.distribution?.[String(i)] ?? 0;
    }
    data.push(row);
  }
  const faceted = groups.length > 1;
  return (
    <div>
      <div className="flex flex-wrap gap-4 justify-center mb-2">
        {groups.map((g, i) => {
          const a = agg(g, q.id);
          return (
            <div key={g.key} className="text-center">
              {faceted && (
                <div
                  className="text-xs font-semibold"
                  style={{ color: PALETTE[i % PALETTE.length] }}
                >
                  {g.label}
                </div>
              )}
              <div className="text-4xl font-black text-indigo-700">
                <Counter value={a?.mean ?? 0} decimals={2} />
              </div>
              <div className="text-xs text-gray-500">
                avg of {a?.responseCount ?? 0}
              </div>
            </div>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ left: 0, right: 8, top: 16, bottom: 0 }}
        >
          <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: 600 }} />
          <YAxis hide allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(99,102,241,0.06)" }} />
          {faceted && <Legend />}
          {groups.map((g, i) => (
            <Bar
              key={g.key}
              dataKey={g.label}
              fill={faceted ? PALETTE[i % PALETTE.length] : "#6366f1"}
              radius={[8, 8, 0, 0]}
              animationDuration={600}
            >
              {!faceted &&
                data.map((_, j) => (
                  <Cell key={j} fill={heat(j / Math.max(1, data.length - 1))} />
                ))}
              <LabelList
                dataKey={g.label}
                position="top"
                style={{ fontWeight: 700 }}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function heat(t: number) {
  // red → amber → green
  const stops = [[239, 68, 68], [245, 158, 11], [16, 185, 129]];
  const seg = t < 0.5 ? 0 : 1, u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const [a, b] = [stops[seg], stops[seg + 1]];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * u)).join(",")})`;
}

/* ---------------- Ranked choice: instant-runoff animation ---------------- */
export function RankedChart(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  if (groups.length > 1) {
    // Faceted: winner per group + Borda bars per group
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((g, i) => {
          const a = agg(g, q.id);
          const rounds = a?.irv ?? [];
          const winner = rounds[rounds.length - 1]?.winner;
          return (
            <div
              key={g.key}
              className="border rounded-xl p-3"
              style={{ borderColor: PALETTE[i % PALETTE.length] }}
            >
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: PALETTE[i % PALETTE.length] }}
              >
                {g.label} · {a?.responseCount ?? 0} ballots
              </div>
              <div className="text-xl font-bold mb-2">
                {winner ? `🏆 ${optLabel(q, winner)}` : "—"}
              </div>
              <IRVRounds q={q} agg={a} compact />
            </div>
          );
        })}
      </div>
    );
  }
  return <IRVRounds q={q} agg={agg(groups[0], q.id)} />;
}

function IRVRounds(
  { q, agg, compact }: {
    q: Question;
    agg?: QuestionAggregate;
    compact?: boolean;
  },
) {
  const rounds = agg?.irv ?? [];
  const [ri, setRi] = useState(0);
  const [mode, setMode] = useState<"irv" | "borda" | "first">("irv");
  useEffect(() => setRi(rounds.length ? rounds.length - 1 : 0), [
    rounds.length,
  ]);

  if (!rounds.length) {
    return (
      <p className="text-gray-400 text-sm text-center py-6">No ballots yet.</p>
    );
  }
  const round = rounds[Math.min(ri, rounds.length - 1)];
  const total = Object.values(round.tallies).reduce((a, b) => a + b, 0);
  const source = mode === "irv"
    ? round.tallies
    : mode === "borda"
    ? agg!.borda!
    : agg!.firstChoice!;
  const max = Math.max(1, ...Object.values(source));
  const ordered = [...q.options].sort((a, b) =>
    (source[b.id] ?? -1) - (source[a.id] ?? -1)
  );
  const eliminatedSoFar = new Set(
    rounds.slice(0, ri).map((r) => r.eliminated).filter(Boolean),
  );

  return (
    <div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          {(["irv", "borda", "first"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-full border ${
                mode === m
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white"
              }`}
            >
              {m === "irv"
                ? "Instant runoff"
                : m === "borda"
                ? "Borda points"
                : "First choices"}
            </button>
          ))}
          {mode === "irv" && rounds.length > 1 && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setRi(Math.max(0, ri - 1))}
                className="px-2 py-1 border rounded bg-white"
              >
                ◀
              </button>
              <span className="font-mono px-1">
                Round {round.round}/{rounds.length}
              </span>
              <button
                onClick={() => setRi(Math.min(rounds.length - 1, ri + 1))}
                className="px-2 py-1 border rounded bg-white"
              >
                ▶
              </button>
              <button
                onClick={() => {
                  setRi(0);
                  let i = 0;
                  const t = setInterval(() => {
                    i++;
                    setRi(i);
                    if (i >= rounds.length - 1) clearInterval(t);
                  }, 1200);
                }}
                className="px-2 py-1 border rounded bg-white"
              >
                ▶▶ replay
              </button>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        {ordered.map((o, i) => {
          const v = source[o.id];
          const out = mode === "irv" &&
            (v === undefined || eliminatedSoFar.has(o.id));
          const isWinner = mode === "irv" && round.winner === o.id;
          const justEliminated = mode === "irv" && round.eliminated === o.id;
          const pct = out ? 0 : ((v ?? 0) / max) * 100;
          return (
            <div
              key={o.id}
              className={`transition-opacity ${out ? "opacity-30" : ""}`}
            >
              <div className="flex justify-between text-sm mb-0.5">
                <span
                  className={`font-medium ${
                    isWinner ? "text-emerald-700" : ""
                  }`}
                >
                  {isWinner && "🏆 "}
                  {out && "✗ "}
                  {o.label}
                  {justEliminated && (
                    <span className="ml-2 text-xs text-red-500">
                      eliminated this round
                    </span>
                  )}
                </span>
                <span className="font-mono text-gray-600">
                  {out ? "—" : v}
                  {mode === "irv" && !out && total
                    ? ` (${Math.round(((v ?? 0) / total) * 100)}%)`
                    : ""}
                </span>
              </div>
              <div
                className={`bg-gray-100 rounded-full overflow-hidden ${
                  compact ? "h-3" : "h-5"
                }`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: isWinner
                      ? "#10b981"
                      : PALETTE[q.options.indexOf(o) % PALETTE.length],
                    transition: "width .8s cubic-bezier(.22,1,.36,1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {mode === "irv" && !compact && (
        <p className="text-xs text-gray-500 mt-2">
          {round.winner
            ? `${
              optLabel(q, round.winner)
            } wins with a majority of ${total} active ballots.`
            : `No majority yet — the lowest option is eliminated and its ballots transfer to their next choice.`}
        </p>
      )}
    </div>
  );
}

/* ---------------- Word cloud ---------------- */
export function WordCloudChart(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const faceted = groups.length > 1;
  return (
    <div className={faceted ? "grid md:grid-cols-2 gap-4" : ""}>
      {groups.map((g, i) => {
        const words = agg(g, q.id)?.words ?? [];
        const max = Math.max(1, ...words.map((w) => w.value));
        return (
          <div
            key={g.key}
            className={faceted ? "border rounded-xl p-3" : ""}
            style={faceted ? { borderColor: PALETTE[i % PALETTE.length] } : {}}
          >
            {faceted && (
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: PALETTE[i % PALETTE.length] }}
              >
                {g.label}
              </div>
            )}
            {words.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-6">
                Nothing yet…
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-2 leading-none">
              {shuffleStable(words).map((w, j) => (
                <span
                  key={w.text}
                  title={`${w.value}×`}
                  style={{
                    fontSize: `${0.9 + (w.value / max) * 2.6}rem`,
                    color: PALETTE[j % PALETTE.length],
                    fontWeight: w.value === max ? 900 : 600,
                    transform: `rotate(${(hash(w.text) % 7) - 3}deg)`,
                    display: "inline-block",
                    transition: "font-size .6s",
                  }}
                >
                  {w.text}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Free text ---------------- */
export function TextList({ q, groups }: { q: Question; groups: FacetGroup[] }) {
  const faceted = groups.length > 1;
  return (
    <div className={faceted ? "grid md:grid-cols-2 gap-4" : ""}>
      {groups.map((g, i) => {
        const texts = agg(g, q.id)?.texts ?? [];
        return (
          <div key={g.key}>
            {faceted && (
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: PALETTE[i % PALETTE.length] }}
              >
                {g.label} ({texts.length})
              </div>
            )}
            {texts.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-6">
                Nothing yet…
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
              {texts.map((t, j) => (
                <div
                  key={j}
                  className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm shadow-sm"
                  style={{ transform: `rotate(${(hash(t) % 3) - 1}deg)` }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- helpers ---------------- */
function agg(g: FacetGroup | undefined, qid: string) {
  return g?.aggregates.find((a) => a.questionId === qid);
}
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function shuffleStable<T extends { text: string }>(arr: T[]) {
  return [...arr].sort((a, b) => hash(a.text) - hash(b.text));
}

/** Animated number that eases toward its target. */
export function Counter(
  { value, decimals = 0 }: { value: number; decimals?: number },
) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const start = v, end = value, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      setV(start + (end - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toFixed(decimals)}</>;
}
