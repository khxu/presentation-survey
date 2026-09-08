import type { Answers, FacetGroup, IRVRound, Question, QuestionAggregate, Survey } from "../shared/types.ts";
import { canonicalizeChoiceSelection } from "../shared/questions.ts";

/** Instant-runoff voting: returns each round's tallies until a majority winner emerges. */
export function instantRunoff(ballots: string[][], optionIds: string[]): IRVRound[] {
  const rounds: IRVRound[] = [];
  let remaining = new Set(optionIds);
  const valid = ballots.filter((b) => b.length > 0);
  if (valid.length === 0) return rounds;

  for (let round = 1; round <= optionIds.length; round++) {
    const tallies: Record<string, number> = {};
    for (const id of remaining) tallies[id] = 0;
    let active = 0;
    for (const b of valid) {
      const top = b.find((id) => remaining.has(id));
      if (top) {
        tallies[top]++;
        active++;
      }
    }
    if (active === 0) break;
    const sorted = [...remaining].sort((a, b) => tallies[b] - tallies[a]);
    const leader = sorted[0];
    if (tallies[leader] * 2 > active || remaining.size <= 1) {
      rounds.push({ round, tallies, eliminated: null, winner: leader });
      break;
    }
    // Eliminate the lowest (ties: eliminate the one appearing later in option order)
    const minVal = Math.min(...[...remaining].map((id) => tallies[id]));
    const losers = [...remaining].filter((id) => tallies[id] === minVal);
    const eliminated = losers[losers.length - 1];
    remaining.delete(eliminated);
    rounds.push({ round, tallies, eliminated, winner: remaining.size === 1 ? [...remaining][0] : null });
    if (remaining.size === 1) break;
  }
  return rounds;
}

const STOP = new Set(
  "the a an and or but of to in on for with is are was were be it this that i you we they my our your".split(" "),
);

export function aggregateQuestion(q: Question, responses: Answers[]): QuestionAggregate {
  const vals = responses.map((r) => r[q.id]).filter((v) => v !== undefined && v !== null && v !== "");
  const agg: QuestionAggregate = { questionId: q.id, type: q.type, responseCount: vals.length };

  switch (q.type) {
    case "single_choice":
    case "emoji_reaction": {
      const counts: Record<string, number> = {};
      for (const o of q.options) counts[o.id] = 0;
      for (const v of vals) if (typeof v === "string" && v in counts) counts[v]++;
      agg.counts = counts;
      break;
    }
    case "multi_choice": {
      const counts: Record<string, number> = {};
      for (const o of q.options) counts[o.id] = 0;
      const combinations = new Map<string, { optionIds: string[]; count: number }>();
      let responseCount = 0;
      for (const v of vals) {
        const optionIds = canonicalizeChoiceSelection(q.options, v);
        if (!optionIds) continue;
        responseCount++;
        for (const id of optionIds) counts[id]++;
        const key = JSON.stringify(optionIds);
        const combination = combinations.get(key);
        if (combination) combination.count++;
        else combinations.set(key, { optionIds, count: 1 });
      }
      const optionIndex = new Map(q.options.map((option, index) => [option.id, index]));
      const compareOptionIds = (a: string[], b: string[]) => {
        if (a.length === 0 || b.length === 0) return a.length === b.length ? 0 : a.length === 0 ? 1 : -1;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          const difference = optionIndex.get(a[i])! - optionIndex.get(b[i])!;
          if (difference) return difference;
        }
        return a.length - b.length;
      };
      agg.counts = counts;
      agg.intersections = [...combinations.values()].sort((a, b) =>
        b.count - a.count || compareOptionIds(a.optionIds, b.optionIds)
      );
      agg.responseCount = responseCount;
      break;
    }
    case "scale": {
      const min = q.scaleMin ?? 1, max = q.scaleMax ?? 5;
      const dist: Record<string, number> = {};
      for (let i = min; i <= max; i++) dist[String(i)] = 0;
      let sum = 0, n = 0;
      for (const v of vals) {
        const num = Number(v);
        if (Number.isFinite(num)) {
          dist[String(num)] = (dist[String(num)] ?? 0) + 1;
          sum += num;
          n++;
        }
      }
      agg.distribution = dist;
      agg.mean = n ? Math.round((sum / n) * 100) / 100 : null;
      break;
    }
    case "free_text": {
      agg.texts = vals.filter((v): v is string => typeof v === "string").slice(-200).reverse();
      break;
    }
    case "word_cloud": {
      const freq = new Map<string, number>();
      const display = new Map<string, string>();
      for (const v of vals) {
        if (typeof v !== "string") continue;
        const key = v.trim().toLowerCase();
        if (!key || STOP.has(key)) continue;
        freq.set(key, (freq.get(key) ?? 0) + 1);
        if (!display.has(key)) display.set(key, v.trim());
      }
      agg.words = [...freq.entries()]
        .map(([k, value]) => ({ text: display.get(k)!, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 80);
      break;
    }
    case "ranked_choice": {
      const ballots = vals.filter((v): v is string[] => Array.isArray(v));
      const ids = q.options.map((o) => o.id);
      agg.irv = instantRunoff(ballots, ids);
      const borda: Record<string, number> = {};
      const first: Record<string, number> = {};
      for (const id of ids) borda[id] = 0, first[id] = 0;
      const n = ids.length;
      for (const b of ballots) {
        b.forEach((id, i) => {
          if (id in borda) borda[id] += n - i;
        });
        if (b[0] && b[0] in first) first[b[0]]++;
      }
      agg.borda = borda;
      agg.firstChoice = first;
      break;
    }
  }
  return agg;
}

/** Build faceted results. groupBy is a demographic question id (or null for a single "all" group). */
export function buildResults(
  survey: Survey,
  responses: Answers[],
  groupBy: string | null,
  visibleQuestions: Question[],
): FacetGroup[] {
  const facetQ = groupBy ? survey.questions.find((q) => q.id === groupBy && q.isDemographic) : undefined;
  if (!facetQ) {
    return [{
      key: "__all__",
      label: "Everyone",
      responseCount: responses.length,
      aggregates: visibleQuestions.map((q) => aggregateQuestion(q, responses)),
    }];
  }

  // Bucket respondents. Multi-choice facets put a respondent in every group they chose.
  const buckets = new Map<string, Answers[]>();
  const labels = new Map<string, string>();
  if (facetQ.type === "scale") {
    const min = facetQ.scaleMin ?? 1, max = facetQ.scaleMax ?? 5;
    for (let i = min; i <= max; i++) buckets.set(String(i), []), labels.set(String(i), String(i));
  } else {
    for (const o of facetQ.options) buckets.set(o.id, []), labels.set(o.id, o.label);
  }
  buckets.set("__none__", []);
  labels.set("__none__", "No answer");

  for (const r of responses) {
    const v = r[facetQ.id];
    if (v === undefined || v === null || v === "") {
      buckets.get("__none__")!.push(r);
    } else if (Array.isArray(v)) {
      let placed = false;
      for (const x of v) if (buckets.has(x)) buckets.get(x)!.push(r), placed = true;
      if (!placed) buckets.get("__none__")!.push(r);
    } else {
      const k = String(v);
      (buckets.get(k) ?? buckets.get("__none__")!).push(r);
    }
  }

  const groups: FacetGroup[] = [];
  for (const [key, rs] of buckets) {
    if (key === "__none__" && rs.length === 0) continue;
    groups.push({
      key,
      label: labels.get(key) ?? key,
      responseCount: rs.length,
      aggregates: visibleQuestions.filter((q) => q.id !== facetQ.id).map((q) => aggregateQuestion(q, rs)),
    });
  }
  return groups;
}
