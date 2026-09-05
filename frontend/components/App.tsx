/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useState } from "https://esm.sh/react@18.2.0";
import { Home } from "../pages/Home.tsx";
import { Admin } from "../pages/Admin.tsx";
import { Respond } from "../pages/Respond.tsx";
import { Results } from "../pages/Results.tsx";
import { Present } from "../pages/Present.tsx";

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function navigate(to: string) {
  history.pushState({}, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const path = usePath();
  const parts = path.split("/").filter(Boolean);

  let page: any = <Home />;
  if (parts[0] === "admin" && parts[1]) page = <Admin adminKey={parts[1]} />;
  else if (parts[0] === "s" && parts[1]) {
    if (parts[2] === "results") page = <Results slug={parts[1]} />;
    else if (parts[2] === "present") page = <Present slug={parts[1]} />;
    else page = <Respond slug={parts[1]} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{page}</div>
      <footer className="text-center text-xs text-gray-400 py-4">
        <a href="/" className="hover:text-gray-600">Audience Survey</a> ·{" "}
        <a href="/source" className="underline hover:text-gray-600">view source</a>
      </footer>
    </div>
  );
}
