/** @jsxImportSource npm:hono@4/jsx */
import { raw } from "npm:hono@4/html";
import { immutableFileUrl } from "https://esm.town/v/std/utils/index.ts";

export function Root() {
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Audience Survey</title>
          <script src="https://cdn.twind.style" crossOrigin="" />
          <link rel="icon" href={immutableFileUrl("/frontend/favicon.svg")} type="image/svg+xml" />
        </head>
        <body className="font-sans text-gray-800 bg-gradient-to-br from-slate-50 to-indigo-50 min-h-screen">
          <div id="root" />
          <script src="https://esm.town/v/std/catch" />
          <script src={immutableFileUrl("/frontend/index.tsx")} type="module" />
        </body>
      </html>
    </>
  );
}
