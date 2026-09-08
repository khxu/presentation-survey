/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useState } from "https://esm.sh/react@18.2.0";
import { api } from "../lib/api.ts";
import { navigate } from "../components/App.tsx";

export function Home() {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: any) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { adminKey } = await api.createSurvey(
        title.trim() || "Untitled survey",
      );
      navigate(`/admin/${adminKey}?new=1`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 pt-20 text-center">
      <div className="text-6xl mb-4">📊</div>
      <h1 className="text-4xl font-extrabold tracking-tight mb-3">
        Audience Survey
      </h1>
      <p className="text-gray-600 mb-10">
        Poll the room during your talk. Show a QR code, collect answers with no
        login, and reveal live results — including ranked-choice runoffs and
        breakdowns by who's in the audience.
      </p>

      <form
        onSubmit={create}
        className="bg-white rounded-2xl shadow-lg p-6 text-left"
      >
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Survey title
        </label>
        <input
          value={title}
          onChange={(e: any) => setTitle(e.target.value)}
          placeholder="e.g. Who's in the room today?"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          maxLength={120}
        />
        <button
          disabled={busy}
          className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
        >
          {busy ? "Creating…" : "Create survey →"}
        </button>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <p className="text-xs text-gray-500 mt-4">
          You'll get a secret admin link. Keep it — it's the only way to edit
          your survey and see results.
        </p>
      </form>

      <div className="mt-12 grid grid-cols-3 gap-4 text-sm text-gray-600">
        <div className="bg-white/60 rounded-xl p-4">
          <div className="text-2xl mb-1">📱</div>QR code join
        </div>
        <div className="bg-white/60 rounded-xl p-4">
          <div className="text-2xl mb-1">🗳️</div>Ranked choice & more
        </div>
        <div className="bg-white/60 rounded-xl p-4">
          <div className="text-2xl mb-1">🔍</div>Facet by demographics
        </div>
      </div>
    </div>
  );
}
