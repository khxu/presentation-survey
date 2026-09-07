/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useCallback, useState } from "https://esm.sh/react@18.2.0";
import { newQuestion, normalizeDraft } from "../../../shared/questions.ts";
import type { QuestionProposal } from "../../../shared/types.ts";
import { api } from "../../lib/api.ts";
import { useProposals } from "../../lib/useProposals.ts";
import { QuestionEditor } from "../builder/QuestionEditor.tsx";
import { ProposalCard } from "./ProposalCard.tsx";

export function CommunityQuestions(
  { slug, acceptingResponses }: { slug: string; acceptingResponses: boolean },
) {
  const fetcher = useCallback(
    (signal: AbortSignal) => api.proposals(slug, signal),
    [slug],
  );
  const { data, error: loadError, refresh } = useProposals(fetcher);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(() => newQuestion());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const open = acceptingResponses && (data?.acceptingResponses ?? false);

  async function submit() {
    setError(null);
    setMessage(null);
    setBusy("submit");
    try {
      await api.propose(slug, normalizeDraft(draft));
      setDraft(newQuestion());
      setComposing(false);
      setMessage(
        "Question proposed! Others can upvote it while the presenter reviews it.",
      );
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not propose this question.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function vote(proposal: QuestionProposal) {
    setError(null);
    setBusy(proposal.id);
    try {
      await api.vote(slug, proposal.id, !proposal.voted);
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not update your vote.",
      );
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 border-t border-gray-200 pt-6 text-left">
      <h2 className="text-xl font-bold">Community questions</h2>
      <p className="text-sm text-gray-600 mt-2">
        Suggest what the room should answer next. Upvote ideas you like; the
        presenter edits and approves them.
      </p>
      <p className="text-xs text-gray-500 mt-2">
        One upvote per question on this device. Tap again to remove it.
      </p>
      {!open && data && (
        <p className="mt-3 text-sm text-amber-700">
          Proposals and voting are closed.
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>
      )}
      {(error || loadError) && (
        <div role="alert" className="mt-3 text-sm text-red-600">
          <p>{error || loadError}</p>
          {loadError && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="underline mt-1"
            >
              Retry loading
            </button>
          )}
        </div>
      )}
      {composing
        ? (
          <div className="mt-4 space-y-3">
            <fieldset disabled={busy !== null || !open} className="min-w-0">
              <QuestionEditor q={draft} onChange={setDraft} participant />
            </fieldset>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={busy !== null || !open}
                className="bg-indigo-600 text-white rounded-lg px-4 py-2 disabled:opacity-40"
              >
                {busy === "submit" ? "Submitting..." : "Propose question"}
              </button>
              <button
                type="button"
                onClick={() => setComposing(false)}
                disabled={busy !== null}
                className="text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )
        : (
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              setMessage(null);
            }}
            disabled={!open || busy !== null}
            className="mt-4 border border-indigo-300 text-indigo-700 rounded-lg px-4 py-2 disabled:opacity-40"
          >
            + Suggest a question
          </button>
        )}
      {!data && !loadError && (
        <p className="mt-4 text-sm text-gray-500">
          Loading community questions...
        </p>
      )}
      {data?.proposals.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No pending proposals yet.</p>
      )}
      <div className="mt-4 space-y-3">
        {data?.proposals.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal}>
            <button
              type="button"
              aria-pressed={proposal.voted}
              aria-label={`${
                proposal.voted ? "Remove upvote for" : "Upvote"
              } ${proposal.draft.prompt}`}
              disabled={!open || busy !== null}
              onClick={() =>
                vote(proposal)}
              className={`ml-auto rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 ${
                proposal.voted
                  ? "bg-indigo-600 text-white"
                  : "bg-indigo-50 text-indigo-700"
              }`}
            >
              {busy === proposal.id
                ? "Saving..."
                : proposal.voted
                ? "Upvoted"
                : "Upvote"}
            </button>
          </ProposalCard>
        ))}
      </div>
    </section>
  );
}
