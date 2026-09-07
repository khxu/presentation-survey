export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "scale"
  | "free_text"
  | "ranked_choice"
  | "word_cloud"
  | "emoji_reaction";

export interface Option {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  options: Option[]; // for choice/ranked/emoji types
  scaleMin?: number; // for scale
  scaleMax?: number;
  isDemographic: boolean;
  required: boolean;
  hidden: boolean; // per-question hide override on results
}

export interface Survey {
  id: string;
  slug: string;
  title: string;
  description: string;
  resultsVisible: boolean;
  acceptingResponses: boolean;
  audienceFacets: boolean; // can the audience use group-by on results?
  createdAt: string;
  questions: Question[];
}

export type QuestionDraft = Pick<Question, "type" | "prompt" | "options" | "scaleMin" | "scaleMax">;

export interface QuestionProposal {
  id: string;
  draft: QuestionDraft;
  status: "pending" | "approved";
  createdAt: string;
  voteCount: number;
  voted: boolean;
}

export interface ProposalsPayload {
  proposals: QuestionProposal[];
  acceptingResponses: boolean;
}

/** Answer values: single -> optionId; multi -> optionId[]; scale -> number;
 *  free_text/word_cloud -> string; ranked_choice -> optionId[] (ordered); emoji -> optionId */
export type AnswerValue = string | number | string[];

export type Answers = Record<string, AnswerValue>;

export interface IRVRound {
  round: number;
  tallies: Record<string, number>;
  eliminated: string | null;
  winner: string | null;
}

export interface QuestionAggregate {
  questionId: string;
  type: QuestionType;
  responseCount: number;
  /** For choice/emoji: counts by optionId. */
  counts?: Record<string, number>;
  /** For scale: counts by value, plus mean. */
  distribution?: Record<string, number>;
  mean?: number | null;
  /** For text/word cloud. */
  texts?: string[];
  words?: { text: string; value: number }[];
  /** For ranked choice. */
  irv?: IRVRound[];
  borda?: Record<string, number>;
  firstChoice?: Record<string, number>;
}

export interface FacetGroup {
  key: string; // optionId or scale value, or "__all__"
  label: string;
  responseCount: number;
  aggregates: QuestionAggregate[];
}

export interface ResultsPayload {
  survey: Survey;
  totalResponses: number;
  groupBy: string | null;
  groups: FacetGroup[];
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "Multiple choice (pick one)",
  multi_choice: "Multiple choice (pick many)",
  scale: "Scale / rating",
  free_text: "Free text",
  ranked_choice: "Ranked choice",
  word_cloud: "Word cloud (one word/phrase)",
  emoji_reaction: "Emoji reaction",
};

export const DEFAULT_EMOJIS = ["🔥", "😍", "🤔", "😴", "😂", "🤯"];

export function hasOptions(t: QuestionType) {
  return t === "single_choice" || t === "multi_choice" || t === "ranked_choice" || t === "emoji_reaction";
}
