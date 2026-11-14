import { AlertTriangle } from "lucide-react";
import type { Monitoring } from "@/api/types";
import { Term } from "@/components/term";
import { fmtNum } from "@/lib/format";

export type Flag = Monitoring["flags"][number];

/** Largest exposure first, so the flags that matter most come first. */
export const byExposure = (flags: Flag[]) => [...flags].sort((a, b) => b.exposure - a.exposure);

export function FlagCard({ flag, compact }: { flag: Flag; compact?: boolean }) {
  const gap = flag.gapType === "level shift" ? "levelShift" : "changeInShape";
  return (
    <div className="flex gap-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
      <div>
        <div className="font-medium">{flag.segment}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs">
          <span>
            <Term k="ae">A/E</Term> <span className="num font-semibold">{flag.ae.toFixed(2)}</span>
          </span>
          <span>
            <Term k="exposure">Exposure</Term> <span className="num">{fmtNum(flag.exposure)}</span> lives
          </span>
          <Term k={gap}>{flag.gapType}</Term>
        </div>
        {!compact && <p className="mt-1 text-muted-foreground">{flag.note}</p>}
      </div>
    </div>
  );
}
