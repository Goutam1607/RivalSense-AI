import "server-only";
import { z } from "zod";

/**
 * Typed environment loader. Fails fast with a clear message when a variable is missing.
 * Secrets are read only on the server — this module cannot be imported by client components.
 */
const schema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres connection URL"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters (generate one with `npx @better-auth/cli secret` or any random string)"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  DEMO_USER_EMAIL: z.string().email().default("demo@rivalsense.dev"),
  DEMO_USER_PASSWORD: z.string().min(8).default("demo-password-123"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  LLM_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
  LLM_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid or missing environment variables:\n${lines.join("\n")}\nSee .env.example in the repo root.`);
  }
  return parsed.data;
}

export const env = load();
