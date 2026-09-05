/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useState } from "https://esm.sh/react@18.2.0";
import { api } from "../lib/api.ts";
import { ResultsView } from "../components/charts/ResultsView.tsx";

/** Public results page — for the projector and for the audience once the admin flips the toggle. */
export function Results({ slug }: { slug: string }) {
  const [title, setTitle] = useState("");
  const [canFacet, setCanFacet] = useState(false);

  useEffect(() => {
    const load = () =>
      api.getSurvey(slug).then((d) => {
        setTitle(d.survey.title);
        setCanFacet(d.survey.audienceFacets);
      }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [slug]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl font-extrabold flex-1">{title}</h1>
        <a href={`/s/${slug}`} className="text-sm text-indigo-600 hover:underline">← answer the survey</a>
      </div>
      <ResultsView fetcher={(g) => api.publicResults(slug, g)} canFacet={canFacet} />
    </div>
  );
}
