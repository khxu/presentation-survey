/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useState } from "https://esm.sh/react@18.2.0";
import { api } from "../lib/api.ts";

/** Fullscreen "join" slide: big QR + URL. Put this on the projector. */
export function Present({ slug }: { slug: string }) {
  const [title, setTitle] = useState("");
  const joinUrl = `${location.origin}/s/${slug}`;

  useEffect(() => {
    api.getSurvey(slug).then((d) => setTitle(d.survey.title)).catch(() => {});
  }, [slug]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-12 text-center">
      <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-8">
        {title || "Join the survey"}
      </h1>
      <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-10">
        <img
          src={`/api/s/${slug}/qr.svg`}
          alt="QR code"
          className="w-[min(60vw,480px)] h-auto"
        />
      </div>
      <p className="mt-8 text-2xl md:text-4xl font-mono text-indigo-700 break-all">
        {joinUrl.replace(/^https?:\/\//, "")}
      </p>
      <p className="mt-4 text-gray-500 text-lg">
        Scan or type the link · no login needed
      </p>
    </div>
  );
}
