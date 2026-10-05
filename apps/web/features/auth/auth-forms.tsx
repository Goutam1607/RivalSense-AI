"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { DisabledWithReason } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { enterDemo } from "@/server/actions/auth";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name (at least 2 characters).").max(80),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use at most 128 characters."),
});

type Errors = Partial<Record<"name" | "email" | "password" | "form", string>>;

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function fieldErrors(issues: z.ZodError["issues"]): Errors {
  const out: Errors = {};
  for (const i of issues) out[i.path[0] as keyof Errors] ??= i.message;
  return out;
}

export function ExploreDemoButton({ variant = "secondary", size = "md", className }: { variant?: "primary" | "secondary"; size?: "md" | "lg"; className?: string }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await enterDemo();
            if (r && !r.ok) setError(r.message);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Explore demo
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

function GithubButton({ enabled }: { enabled: boolean }) {
  const btn = (
    <Button
      variant="secondary"
      className="w-full"
      type="button"
      onClick={() => enabled && authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" })}
    >
      <GithubMark />
      Continue with GitHub
    </Button>
  );
  if (enabled) return btn;
  return (
    <DisabledWithReason reason="GitHub sign-in is not configured on this server (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET).">
      {btn}
    </DisabledWithReason>
  );
}

export function LoginForm({ githubEnabled }: { githubEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error.issues));
    setErrors({});
    setPending(true);
    const { error } = await authClient.signIn.email({ email: parsed.data.email, password: parsed.data.password });
    setPending(false);
    if (error) {
      setErrors({
        form:
          error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : error.status === 401 || error.status === 400
              ? "Email or password is incorrect."
              : "Sign-in failed. Please try again.",
      });
      return;
    }
    router.push(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={errors.form ? "form-error" : undefined}>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="email-error" required />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input id="password" name="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby="password-error" required />
        </Field>
        {errors.form && (
          <p id="form-error" role="alert" className="rounded-md border border-negative-border bg-negative-bg px-3 py-2 text-sm text-negative">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Sign in
        </Button>
      </form>
      <Divider />
      <div className="space-y-2">
        <GithubButton enabled={githubEnabled} />
        <ExploreDemoButton />
      </div>
      <p className="text-center text-sm text-fg-muted">
        No account?{" "}
        <Link href="/signup" className="text-accent underline underline-offset-2">
          Create one
        </Link>
      </p>
    </div>
  );
}

export function SignupForm({ githubEnabled }: { githubEnabled: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = signupSchema.safeParse(data);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error.issues));
    setErrors({});
    setPending(true);
    const { error } = await authClient.signUp.email({ ...parsed.data });
    setPending(false);
    if (error) {
      setErrors({
        form:
          error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : error.code === "USER_ALREADY_EXISTS" || error.status === 422
              ? "An account with this email already exists. Sign in instead."
              : error.message || "Sign-up failed. Please try again.",
      });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby="name-error" required />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="email-error" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters." error={errors.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="password-error" required />
        </Field>
        {errors.form && (
          <p role="alert" className="rounded-md border border-negative-border bg-negative-bg px-3 py-2 text-sm text-negative">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Create account
        </Button>
      </form>
      <Divider />
      <div className="space-y-2">
        <GithubButton enabled={githubEnabled} />
        <ExploreDemoButton />
      </div>
      <p className="text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-fg-subtle">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
