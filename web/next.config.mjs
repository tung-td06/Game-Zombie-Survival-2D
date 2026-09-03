import { setupDevPlatform } from "@cloudflare/next-on-pages/next-dev";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Files under `src/server/**` are Node.js-only (they use `node:fs` and
  // `node:path`). They are loaded lazily through a dynamic `import()` from
  // `src/lib/db.ts`. We must keep them out of the Cloudflare Pages /
  // Edge bundle entirely.
  //
  // `serverExternalPackages` tells Next.js / webpack to leave these
  // modules as bare specifiers that are not inlined into client or
  // edge bundles. Combined with `outputFileTracingExcludes`, this
  // guarantees that the `node:fs` / `node:path` imports inside
  // `persistent-storage.ts` never reach the Cloudflare Edge compiler.
  serverExternalPackages: ["src/server/persistent-storage"],
  outputFileTracingExcludes: {
    "*": ["./src/server/persistent-storage.ts", "./src/server/**"],
  },
};

if (process.env.NODE_ENV === "development") {
  await setupDevPlatform();
}

export default nextConfig;
