/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useCallback, useState } from "https://esm.sh/react@18.2.0";
import type { Question, QuestionProposal } from "../../../shared/types.ts";
import {
  normalizeApprovedQuestion,
  questionFromDraft,
} from "../../../shared/questions.ts";
import { api } from "../../lib/api.ts";
import { useProposals } from "../../lib/useProposals.ts";
import { QuestionEditor } from "../builder/QuestionEditor.tsx";
import { ProposalCard } from "./ProposalCard.tsx";

interface Props {
  adminKey: string;
  onApprove: (proposalId: string, question: Question) => Promise<void>;
}

export function ProposalReview({ adminKey, onApprove }: Props) {
  const fetcher = useCallback(
    (signal: AbortSignal) => api.admin.proposals(adminKey, signal),
    [adminKey],
  );
  const { data, error: loadError, refresh } = useProposals(fetcher);
  const [selected, setSelected] = useState<
    { id: string; question: Question } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stillPending = selected &&
    data?.proposals.some((p) => p.id === selected.id);

  function review(proposal: QuestionProposal) {
    setSelected({
      id: proposal.id,
      question: questionFromDraft(proposal.draft),
    });
    setError(null);
    setMessage(null);
  }

  async function approve() {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      await onApprove(
        selected.id,
        normalizeApprovedQuestion(selected.question),
      );
      setSelected(null);
      setMessage("Approved and added to the end of the survey.");
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not approve this question.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Participant proposals</h2>
        <p className="text-sm text-gray-600 mt-1">
          Most-upvoted first. Review and edit a draft before adding it to the
          live survey.
        </p>
      </div>
      {(error || loadError) && (
        <div role="alert" className="text-sm text-red-600">
          <p>{error || loadError}</p>
          {loadError && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="underline"
            >
              Retry loading
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-700">{message}</p>
      )}
      {selected && (
        <div className="rounded-xl border-2 border-indigo-300 p-4 space-y-3">
          <h3 className="font-semibold">Review draft</h3>
          <fieldset disabled={busy} className="min-w-0">
            <QuestionEditor
              q={selected.question}
              onChange={(question) => setSelected({ ...selected, question })}
            />
          </fieldset>
          {!stillPending && (
            <p className="text-sm text-amber-700">
              This proposal is no longer pending.
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={approve}
              disabled={busy || !stillPending}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 disabled:opacity-40"
            >
              {busy ? "Approving..." : "Approve and add question"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={busy}
              className="text-gray-600"
            >
              Cancel review
            </button>
          </div>
        </div>
      )}
      {!data && !loadError && (
        <p className="text-gray-500">Loading proposals...</p>
      )}
      {data?.proposals.length === 0 && (
        <p className="text-gray-500">
          No pending proposals. Participants can suggest questions from the
          survey intro or completion screen.
        </p>
      )}
      {data?.proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              review(proposal)}
            className="ml-auto text-indigo-700 underline text-sm"
          >
            Review
          </button>
        </ProposalCard>
      ))}
    </section>
  );
}
