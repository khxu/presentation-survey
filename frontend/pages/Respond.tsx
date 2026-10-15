/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@18.2.0";
import type { Answers, AnswerValue, Survey } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import {
  hasCurrentAnswer,
  questionStepKey,
  reconcileQuestionStep,
  spectrumAnswerStage,
} from "../lib/respondFlow.ts";
import { QuestionInput } from "../components/respond/QuestionInput.tsx";
import { CommunityQuestions } from "../components/proposals/CommunityQuestions.tsx";

export function Respond({ slug }: { slug: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [savedAnswers, setSavedAnswers] = useState<Answers>({});
  const [returning, setReturning] = useState(false);
  const [step, setStep] = useState(-1); // -1 = intro, n = question, len = done
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [completedQuestions, setCompletedQuestions] = useState<string[] | null>(
    null,
  );
  const pollRef = useRef<number | null>(null);
  const surveyRef = useRef<Survey | null>(null);
  const releasedQuestionIds = useRef<Set<string>>(new Set());
  const saveVersion = useRef(0);
  const savingRef = useRef(false);
  const submittedSteps = useRef(new Set<string>());

  useEffect(() => {
    api.getSurvey(slug).then((d) => {
      surveyRef.current = d.survey;
      releasedQuestionIds.current = new Set(
        d.survey.questions.map((question) => question.id),
      );
      setSurvey(d.survey);
      if (d.existing && Object.keys(d.existing).length) {
        setAnswers(d.existing);
        setSavedAnswers(d.existing);
        setReturning(true);
      }
    }).catch((e) => setError(e.message));
    // Poll for survey changes (admin may add questions or toggle results mid-talk)
    pollRef.current = setInterval(() => {
      if (savingRef.current) return;
      const version = saveVersion.current;
      api.getSurvey(slug).then((d) => {
        if (version !== saveVersion.current) return;
        const previous = surveyRef.current;
        if (previous) {
          setStep((currentStep) =>
            reconcileQuestionStep(
              previous.questions,
              d.survey.questions,
              currentStep,
            )
          );
        }
        const nextIds = new Set(
          d.survey.questions.map((question) => question.id),
        );
        const newlyReleased = d.survey.questions.filter((question) =>
          !releasedQuestionIds.current.has(question.id)
        );
        const changedStages = d.survey.questions.filter((question) => {
          const prior = previous?.questions.find((q) => q.id === question.id);
          return prior && questionStepKey(prior) !== questionStepKey(question);
        });
        setSavedAnswers(d.existing ?? {});
        if (newlyReleased.length || changedStages.length) {
          setAnswers((current) => {
            const next = { ...current };
            for (const question of newlyReleased) {
              if (
                next[question.id] === undefined &&
                d.existing?.[question.id] !== undefined
              ) {
                next[question.id] = d.existing[question.id];
              }
            }
            for (const question of changedStages) {
              if (d.existing?.[question.id] !== undefined) {
                next[question.id] = d.existing[question.id];
              } else delete next[question.id];
            }
            return next;
          });
        }
        releasedQuestionIds.current = nextIds;
        surveyRef.current = d.survey;
        setSurvey(d.survey);
      }).catch(() => {});
    }, 8000) as unknown as number;
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [slug]);

  // Save after each answer so partial progress counts and nothing is lost
  async function persist(next: Answers) {
    savingRef.current = true;
    saveVersion.current++;
    setSaving(true);
    try {
      const result = await api.respond(slug, next);
      setAnswers(result.answers);
      setSavedAnswers(result.answers);
      setError(null);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (error && !survey) {
    return (
      <Card>
        <div className="text-4xl mb-2">🤷</div>
        <p>{error}</p>
      </Card>
    );
  }
  if (!survey) {
    return <div className="text-center mt-24 text-gray-500">Loading…</div>;
  }

  const qs = survey.questions;
  const total = qs.length;

  if (!survey.acceptingResponses && step < total) {
    return (
      <Card>
        <div className="text-5xl mb-3">🚪</div>
        <h1 className="text-2xl font-bold mb-2">{survey.title}</h1>
        <p className="text-gray-600">This survey is closed to new responses.</p>
        {survey.resultsVisible && <ResultsLink slug={slug} />}
        <CommunityQuestions slug={slug} acceptingResponses={false} />
      </Card>
    );
  }

  if (step === -1) {
    return (
      <Card>
        <h1 className="text-3xl font-extrabold mb-3">{survey.title}</h1>
        {survey.description && (
          <p className="text-gray-600 mb-4 whitespace-pre-wrap">
            {survey.description}
          </p>
        )}
        <p className="text-sm text-gray-500 mb-6">
          {total} question{total === 1 ? "" : "s"} · takes about{" "}
          {Math.max(1, Math.ceil(total / 3))} min
        </p>
        {returning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
            👋 Welcome back — this device already answered. You can review and
            update your answers.
          </div>
        )}
        <button
          disabled={total === 0}
          onClick={() => setStep(0)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-4 rounded-xl text-lg"
        >
          {returning ? "Review my answers" : "Start →"}
        </button>
        {total === 0 && (
          <p className="text-xs text-gray-400 mt-3">
            The presenter hasn't added questions yet — hang tight, this page
            refreshes automatically.
          </p>
        )}
        {survey.resultsVisible && <ResultsLink slug={slug} />}
        <CommunityQuestions
          slug={slug}
          acceptingResponses={survey.acceptingResponses}
        />
      </Card>
    );
  }

  if (completedQuestions !== null || step >= total) {
    const addedQuestions = completedQuestions === null
      ? []
      : qs.filter((q) => !completedQuestions.includes(questionStepKey(q)));
    return (
      <Card>
        <div className="text-6xl mb-3">🎉</div>
        <h1 className="text-2xl font-bold mb-2">Thanks!</h1>
        <p className="text-gray-600 mb-4">
          Your answers are in{saving ? " (saving…)" : ""}.
        </p>
        {error && (
          <p role="alert" className="text-red-600 text-sm mb-3">{error}</p>
        )}
        {addedQuestions.length > 0 && survey.acceptingResponses && (
          <button
            onClick={() => {
              setStep(qs.findIndex((q) => q.id === addedQuestions[0].id));
              setCompletedQuestions(null);
            }}
            className="mb-4 bg-indigo-50 text-indigo-700 rounded-xl px-4 py-3 font-semibold"
          >
            {addedQuestions.length}{" "}
            new question{addedQuestions.length === 1 ? "" : "s"}{" "}
            or after stage available - answer now
          </button>
        )}
        {survey.resultsVisible
          ? <ResultsLink slug={slug} big />
          : (
            <p className="text-sm text-gray-500">
              The presenter will reveal results shortly. Keep this tab open —
              the link will appear here.
            </p>
          )}
        <button
          onClick={() => {
            setStep(0);
            setCompletedQuestions(null);
          }}
          className="mt-6 text-sm text-indigo-600 underline"
        >
          Edit my answers
        </button>
        <CommunityQuestions
          slug={slug}
          acceptingResponses={survey.acceptingResponses}
        />
      </Card>
    );
  }

  const q = qs[step];
  const v = answers[q.id];
  const answered = hasCurrentAnswer(q, v, savedAnswers[q.id]);
  const canNext = answered || !q.required;

  function setAnswer(val: AnswerValue | undefined) {
    const next = { ...answers };
    if (val === undefined) delete next[q.id];
    else next[q.id] = val;
    setAnswers(next);
  }

  const needsLateBaseline = q.type === "paired_spectrum" &&
    q.spectrumPhase === "after" &&
    spectrumAnswerStage(q, savedAnswers[q.id]) === "before";

  async function next() {
    if (!await persist(answers)) return;
    if (needsLateBaseline && answered) return;
    submittedSteps.current.add(questionStepKey(q));
    if (step === total - 1) {
      setCompletedQuestions([...submittedSteps.current]);
    }
    setStep(step + 1);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="h-1.5 bg-gray-200 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mb-2 flex justify-between">
        <span>Question {step + 1} of {total}</span>
        {q.isDemographic && <span className="text-amber-600">about you</span>}
      </div>
      <h2 className="text-2xl font-bold mb-6 leading-snug">
        {q.prompt || "…"}
      </h2>
      <fieldset disabled={saving} className="min-w-0">
        <QuestionInput
          q={q}
          value={v}
          savedValue={savedAnswers[q.id]}
          onChange={setAnswer}
        />
      </fieldset>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <div className="flex gap-3 mt-8">
        <button
          onClick={() => setStep(step - 1)}
          disabled={saving}
          className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-600"
        >
          ←
        </button>
        <button
          onClick={next}
          disabled={!canNext || saving}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-lg"
        >
          {saving
            ? "Saving..."
            : needsLateBaseline && answered
            ? "Save before & continue →"
            : step === total - 1
            ? "Submit ✓"
            : answered
            ? "Next →"
            : q.required
            ? "Answer to continue"
            : "Skip →"}
        </button>
      </div>
    </div>
  );
}

function Card({ children }: { children: any }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        {children}
      </div>
    </div>
  );
}

function ResultsLink({ slug, big }: { slug: string; big?: boolean }) {
  return (
    <a
      href={`/s/${slug}/results`}
      className={`inline-block mt-4 ${
        big
          ? "bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold"
          : "text-indigo-600 underline text-sm"
      }`}
    >
      📊 See live results
    </a>
  );
}
