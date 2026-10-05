import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/auth-forms";
import { githubEnabled } from "@/server/auth";
import { getSession } from "@/server/context";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-lg font-semibold">Sign in to RivalSense</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">Track what your competitors&apos; customers say, with evidence.</p>
      <Suspense>
        <LoginForm githubEnabled={githubEnabled} />
      </Suspense>
    </>
  );
}
