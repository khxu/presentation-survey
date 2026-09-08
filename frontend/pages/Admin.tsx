/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@18.2.0";
import type { Question, Survey } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { mergePublishedQuestion, questionsEqual } from "../lib/questionDraft.ts";
import { newQuestion, QuestionEditor } from "../components/builder/QuestionEditor.tsx";
import { ResultsView } from "../components/charts/ResultsView.tsx";
import { ProposalReview } from "../components/proposals/ProposalReview.tsx";

type Tab = "build" | "share" | "results" | "proposals";

export function Admin({ adminKey }: { adminKey: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(location.search.includes("new=1") ? "share" : "build");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [savedQuestions, setSavedQuestions] = useState<Question[]>([]);
  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);
  const [questionSaveStatus, setQuestionSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [approving, setApproving] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const pendingPatch = useRef<Partial<Survey>>({});
  const inFlight = useRef<Promise<void> | null>(null);
  const questionsDirty = !questionsEqual(draftQuestions, savedQuestions);

  useEffect(() => {
    api.admin.get(adminKey).then((d) => {
      setSavedQuestions(d.survey.questions);
      setDraftQuestions(d.survey.questions);
      setSurvey(d.survey);
      setTotal(d.totalResponses);
    }).catch((e) =>
      setError(e.message)
    );
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [adminKey]);

  useEffect(() => {
    if (!questionsDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [questionsDirty]);

  // Merge debounced metadata fields and serialize writes.
  async function flush() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (inFlight.current) return await inFlight.current;
    const request = (async () => {
      while (Object.keys(pendingPatch.current).length) {
        const patch = pendingPatch.current;
        pendingPatch.current = {};
        try {
          const { survey: fresh } = await api.admin.patch(adminKey, patch);
          setSurvey({ ...fresh, ...pendingPatch.current });
        } catch (error) {
          pendingPatch.current = { ...patch, ...pendingPatch.current };
          throw error;
        }
      }
    })();
    inFlight.current = request;
    try {
      await request;
      setSaving("saved");
      setError(null);
    } finally {
      inFlight.current = null;
    }
  }

  function saveError(error: unknown) {
    setSaving("idle");
    setError(error instanceof Error ? error.message : "Could not save changes.");
  }

  function edit(patch: Partial<Survey>) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    setSurvey((current) => current ? { ...current, ...patch } : current);
    setSaving("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flush().catch(saveError);
    }, 600) as unknown as number;
  }

  // Immediate save for toggles
  async function toggle(patch: Partial<Survey>) {
    edit(patch);
    await flush().catch(saveError);
  }

  function editQuestions(questions: Question[]) {
    setDraftQuestions(questions);
    setQuestionSaveStatus("idle");
  }

  async function saveQuestions() {
    if (!questionsDirty || questionSaveStatus === "saving") return;
    setQuestionSaveStatus("saving");
    setQuestionError(null);
    try {
      await flush();
    } catch (error) {
      saveError(error);
      setQuestionSaveStatus("idle");
      return;
    }
    try {
      const { survey: fresh } = await api.admin.patch(adminKey, {
        questions: draftQuestions,
        expectedQuestions: savedQuestions,
      });
      setSavedQuestions(fresh.questions);
      setDraftQuestions(fresh.questions);
      setSurvey(fresh);
      setQuestionSaveStatus("saved");
    } catch (error) {
      setQuestionSaveStatus("idle");
      setQuestionError(error instanceof Error ? error.message : "Could not save questions.");
    }
  }

  async function approve(proposalId: string, question: Question) {
    setApproving(true);
    try {
      try {
        await flush();
      } catch (error) {
        saveError(error);
        throw error;
      }
      const { survey: fresh, approvedQuestion } = await api.admin.approveProposal(adminKey, proposalId, question);
      setSavedQuestions(questionsDirty ? mergePublishedQuestion(savedQuestions, approvedQuestion) : fresh.questions);
      setDraftQuestions(questionsDirty ? mergePublishedQuestion(draftQuestions, approvedQuestion) : fresh.questions);
      setQuestionSaveStatus(questionsDirty ? "idle" : "saved");
      setQuestionError(null);
      setSurvey(fresh);
    } finally {
      setApproving(false);
    }
  }

  if (error && !survey) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center bg-white rounded-2xl shadow p-8">
        <div className="text-4xl mb-2">🔒</div>
        <h1 className="text-xl font-bold mb-2">Invalid admin link</h1>
        <p className="text-gray-600 text-sm">{error}</p>
        <a href="/" className="inline-block mt-4 text-indigo-600 underline">Create a new survey</a>
      </div>
    );
  }
  if (!survey) return <div className="text-center mt-24 text-gray-500">Loading…</div>;

  const adminUrl = `${location.origin}/admin/${adminKey}`;
  const joinUrl = `${location.origin}/s/${survey.slug}`;
  const resultsUrl = `${location.origin}/s/${survey.slug}/results`;
  const presentUrl = `${location.origin}/s/${survey.slug}/present`;

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const questions = draftQuestions;
  const setQuestions = editQuestions;

  return (
    <fieldset
      disabled={approving || questionSaveStatus === "saving"}
      className="min-w-0 max-w-4xl mx-auto px-4 py-8"
    >
      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <p>{error} Your unsaved edits are still shown.</p>
          <div className="flex flex-wrap gap-4 mt-2">
            <button onClick={() => void flush().catch(saveError)} className="underline">Retry save</button>
            <button onClick={() => location.reload()} className="underline">Reload saved version (discard local edits)</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <input
          value={survey.title}
          onChange={(e: any) => edit({ title: e.target.value })}
          className="flex-1 text-3xl font-extrabold bg-transparent border-b-2 border-transparent focus:border-indigo-400 focus:outline-none"
        />
        <span className="text-xs text-gray-400 w-14 text-right">
          {saving === "saving" ? "saving…" : saving === "saved" ? "saved ✓" : ""}
        </span>
      </div>

      {location.search.includes("new=1") && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 text-sm">
          <strong>🔑 Bookmark this page!</strong> This secret admin link is the only way back to your survey:
          <div className="flex gap-2 mt-2">
            <code className="flex-1 bg-white border rounded px-2 py-1 text-xs break-all">{adminUrl}</code>
            <button onClick={() => copy(adminUrl)} className="bg-amber-500 text-white px-3 rounded text-xs">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Live controls */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-4 items-center">
        <Switch
          on={survey.acceptingResponses}
          onChange={(v) => toggle({ acceptingResponses: v })}
          label="Accepting responses"
        />
        <Switch on={survey.resultsVisible} onChange={(v) => toggle({ resultsVisible: v })} label="Show results to audience" />
        <Switch
          on={survey.audienceFacets}
          onChange={(v) => toggle({ audienceFacets: v })}
          label="Audience can group results"
        />
        <div className="ml-auto text-sm text-gray-600">
          <span className="text-2xl font-bold text-indigo-600">{total}</span> responses
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {(["build", "proposals", "share", "results"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-medium capitalize -mb-px border-b-2 ${
              tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t === "build" ? "✏️ Build" : t === "share" ? "📱 Share" : t === "proposals" ? "Proposals" : "📊 Results"}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <div className="space-y-3">
          <textarea
            value={survey.description}
            onChange={(e: any) => edit({ description: e.target.value })}
            placeholder="Optional intro shown to respondents…"
            className="w-full bg-white rounded-xl shadow p-3 text-sm resize-none"
            rows={2}
          />
          <p className="text-xs text-gray-500">
            💡 Mark questions like “What's your profession?” as <span className="text-amber-600 font-semibold">Demographic</span> to
            group every other answer by them on the results screen.
          </p>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-52">
              <p className={`text-sm font-semibold ${questionsDirty ? "text-amber-700" : "text-emerald-700"}`}>
                {questionsDirty ? "Unsaved question changes" : "Questions are saved"}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Respondents see only the last saved version of the question list.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveQuestions()}
              disabled={!questionsDirty || questionSaveStatus === "saving"}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold px-5 py-2.5 rounded-lg"
            >
              {questionSaveStatus === "saving"
                ? "Saving..."
                : questionsDirty
                ? "Save questions"
                : questionSaveStatus === "saved"
                ? "Questions saved ✓"
                : "Save questions"}
            </button>
          </div>
          {questionError && (
            <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              <p>{questionError} Your unsaved question changes are still shown.</p>
              <div className="flex flex-wrap gap-4 mt-2">
                <button type="button" onClick={() => void saveQuestions()} className="underline">Retry save</button>
                <button type="button" onClick={() => location.reload()} className="underline">
                  Reload saved version (discard local edits)
                </button>
              </div>
            </div>
          )}
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              index={i}
              total={questions.length}
              onChange={(nq) => setQuestions(questions.map((x) => x.id === q.id ? nq : x))}
              onDelete={() => setQuestions(questions.filter((x) => x.id !== q.id))}
              onMove={(dir) => {
                const j = i + dir;
                if (j < 0 || j >= questions.length) return;
                const arr = [...questions];
                [arr[i], arr[j]] = [arr[j], arr[i]];
                setQuestions(arr);
              }}
            />
          ))}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setQuestions([...questions, newQuestion("single_choice")])} className="btn-add">+ Multiple choice</button>
            <button onClick={() => setQuestions([...questions, newQuestion("scale")])} className="btn-add">+ Scale</button>
            <button onClick={() => setQuestions([...questions, newQuestion("ranked_choice")])} className="btn-add">+ Ranked choice</button>
            <button onClick={() => setQuestions([...questions, newQuestion("word_cloud")])} className="btn-add">+ Word cloud</button>
            <button onClick={() => setQuestions([...questions, newQuestion("free_text")])} className="btn-add">+ Free text</button>
            <button onClick={() => setQuestions([...questions, newQuestion("emoji_reaction")])} className="btn-add">+ Emoji</button>
          </div>
          <style>{`.btn-add{background:#fff;border:1px dashed #a5b4fc;color:#4338ca;border-radius:.75rem;padding:.5rem .9rem;font-size:.875rem} .btn-add:hover{background:#eef2ff}`}</style>
        </div>
      )}

      {tab === "share" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow p-6 text-center">
            <img src={`/api/s/${survey.slug}/qr.svg`} alt="QR" className="w-64 h-64 mx-auto" />
            <p className="mt-3 font-mono text-indigo-700 break-all">{joinUrl.replace(/^https?:\/\//, "")}</p>
            <a
              href={presentUrl}
              target="_blank"
              className="inline-block mt-4 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-indigo-700"
            >
              🖥 Open fullscreen join slide
            </a>
          </div>
          <div className="space-y-3 text-sm">
            <LinkRow label="Respondent link" url={joinUrl} onCopy={copy} />
            <LinkRow label="Public results (needs toggle on)" url={resultsUrl} onCopy={copy} />
            <LinkRow label="Admin link (secret!)" url={adminUrl} onCopy={copy} danger />
            <div className="bg-white rounded-xl shadow p-4 space-y-2">
              <a href={`/api/admin/${adminKey}/export.csv`} className="block text-indigo-600 hover:underline">⬇ Export responses as CSV</a>
              <button
                onClick={async () => {
                  if (confirm("Delete ALL responses? This cannot be undone.")) {
                    await api.admin.clearResponses(adminKey);
                    setTotal(0);
                  }
                }}
                className="block text-red-600 hover:underline"
              >
                🧹 Clear all responses
              </button>
              <button
                onClick={async () => {
                  if (confirm("Delete this survey and all its responses?")) {
                    await api.admin.deleteSurvey(adminKey);
                    location.href = "/";
                  }
                }}
                className="block text-red-600 hover:underline"
              >
                🗑 Delete survey
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "results" && (
        <ResultsView
          fetcher={(groupBy) => api.admin.results(adminKey, groupBy, true)}
          canFacet
          onTotal={setTotal}
          projectorUrl={resultsUrl}
        />
      )}
      {tab === "proposals" && <ProposalReview adminKey={adminKey} onApprove={approve} />}
    </fieldset>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm">
      <span className={`w-10 h-6 rounded-full relative transition ${on ? "bg-green-500" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={on ? "font-semibold" : "text-gray-500"}>{label}</span>
    </button>
  );
}

function LinkRow({ label, url, onCopy, danger }: { label: string; url: string; onCopy: (s: string) => void; danger?: boolean }) {
  return (
    <div className={`bg-white rounded-xl shadow p-3 ${danger ? "border border-amber-300" : ""}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex gap-2">
        <code className="flex-1 text-xs break-all">{url}</code>
        <button onClick={() => onCopy(url)} className="text-indigo-600 text-xs hover:underline shrink-0">copy</button>
      </div>
    </div>
  );
}
