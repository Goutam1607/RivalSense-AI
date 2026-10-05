"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const KEY = "rs-theme";

/** Inline script that sets the theme class before first paint (no flash). */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>("system");
  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read persisted preference after hydration
      setTheme((localStorage.getItem(KEY) as Theme) || "system");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    apply(t);
  };
  const opts: { t: Theme; Icon: typeof Sun; label: string }[] = [
    { t: "light", Icon: Sun, label: "Light theme" },
    { t: "dark", Icon: Moon, label: "Dark theme" },
    { t: "system", Icon: Monitor, label: "System theme" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-md border border-border p-0.5", className)}>
      {opts.map(({ t, Icon, label }) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          aria-label={label}
          title={label}
          onClick={() => choose(t)}
          className={cn(
            "rounded-sm p-1 text-fg-subtle hover:text-fg",
            theme === t && "bg-bg-muted text-fg",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
