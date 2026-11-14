import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Wraps a technical term. Tap, click or press Enter to see what it means and how to read it. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[k] as { name: string; meaning: string; read?: string };
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`What is ${entry.name}?`}
        className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {children ?? entry.name}
      </PopoverTrigger>
      <PopoverContent className="text-sm" side="top">
        <div className="font-semibold">{entry.name}</div>
        <p className="mt-1">{entry.meaning}</p>
        {entry.read && (
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground">How to read it. </span>
            {entry.read}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
