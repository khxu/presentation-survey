/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type { ReactNode } from "https://esm.sh/react@18.2.0";
import type { QuestionProposal } from "../../../shared/types.ts";
import { QUESTION_TYPE_LABELS } from "../../../shared/types.ts";

export function ProposalCard(
  { proposal, children }: { proposal: QuestionProposal; children: ReactNode },
) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 text-left">
      <p className="text-xs text-gray-500 mb-1">
        {QUESTION_TYPE_LABELS[proposal.draft.type]}
      </p>
      <h3 className="font-semibold break-words whitespace-pre-wrap">
        {proposal.draft.prompt}
      </h3>
      {proposal.draft.options.length > 0 && (
        <ul className="list-disc pl-5 mt-2 text-sm text-gray-600 space-y-1">
          {proposal.draft.options.map((option) => (
            <li key={option.id} className="break-words">{option.label}</li>
          ))}
        </ul>
      )}
      {proposal.draft.type === "scale" && (
        <p className="mt-2 text-sm text-gray-600">
          Scale: {proposal.draft.scaleMin} to {proposal.draft.scaleMax}
        </p>
      )}
      {proposal.draft.type === "matrix_2x2" && (
        <div className="mt-2 text-sm text-gray-600">
          <p>
            2×2 matrix · place{" "}
            <strong>{proposal.draft.matrixSubjectLabel}</strong> ·{" "}
            {proposal.draft.matrixReferences?.length ?? 0} comparison point
            {(proposal.draft.matrixReferences?.length ?? 0) === 1 ? "" : "s"}
          </p>
          {proposal.draft.matrixAxisLabels && (
            <p className="mt-1 text-xs">
              {proposal.draft.matrixAxisLabels.left} ↔{" "}
              {proposal.draft.matrixAxisLabels.right} ·{" "}
              {proposal.draft.matrixAxisLabels.bottom} ↕{" "}
              {proposal.draft.matrixAxisLabels.top}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <span className="text-sm text-gray-600">
          {proposal.voteCount} upvote{proposal.voteCount === 1 ? "" : "s"}
        </span>
        {children}
      </div>
    </article>
  );
}
