"use client";

import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/ui/states";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorNotice
      description={
        <>
          The page hit an unexpected error. Your data is safe.
          {error.digest && <span className="mt-1 block text-xs text-fg-subtle">Reference: {error.digest}</span>}
        </>
      }
      action={
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
      }
    />
  );
}
