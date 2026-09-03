declare module "*.css";

// Cloudflare Workers / D1 environment bindings
interface CloudflareEnv {
  DB: D1Database;
}

declare global {
  // Available in Edge Runtime via @cloudflare/next-on-pages getRequestContext()
  type Env = CloudflareEnv;
}
