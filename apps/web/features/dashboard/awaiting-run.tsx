import { Terminal } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { fmtInt } from "@/lib/format";

export function AwaitingRun({ reviewCount }: { reviewCount: number }) {
  return (
    <Panel>
      <EmptyState
        icon={Terminal}
        title="Awaiting first analysis run"
        description={
          <>
            {fmtInt(reviewCount)} reviews are stored for this market. Analysis runs offline in the Python pipeline, not in the browser. From{" "}
            <code className="rounded bg-bg-muted px-1 font-mono text-xs">services/pipeline</code> run{" "}
            <code className="rounded bg-bg-muted px-1 font-mono text-xs">python -m pipeline run --provider demo</code> (or{" "}
            <code className="rounded bg-bg-muted px-1 font-mono text-xs">--provider db --workspace … --market …</code> for your own market), then refresh.
          </>
        }
      />
    </Panel>
  );
}

