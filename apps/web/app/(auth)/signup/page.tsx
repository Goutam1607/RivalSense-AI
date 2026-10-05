import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/features/auth/auth-forms";
import { githubEnabled } from "@/server/auth";
import { getSession } from "@/server/context";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">
        You get a private workspace for your own market, plus read-only access to the demo market.
      </p>
      <SignupForm githubEnabled={githubEnabled} />
    </>
  );
}
