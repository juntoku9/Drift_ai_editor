"use client";

import { useState } from "react";

interface ActionCardProps {
  recommendedAction: string;
  narrative?: string;
  synthesisPending?: boolean;
}

/** Split a recommended-action string into bullet-worthy chunks.
 *  Splits on ", and " / "; " / sentence boundaries while keeping
 *  each chunk meaningful (won't split into tiny fragments). */
function splitAction(text: string): string[] {
  // First try splitting on ", and " or "; " — common compound patterns
  const parts = text.split(/(?:,\s+and\s+|;\s+)/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts;
  // Fall back to sentence splitting (period + space + uppercase)
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) return sentences;
  return [text];
}

export function ActionCard({ recommendedAction, narrative, synthesisPending }: ActionCardProps) {
  const [showNarrative, setShowNarrative] = useState(false);

  return (
    <section className="rounded-3xl bg-ink p-6 text-white md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
        Recommended Next Step
      </p>

      {synthesisPending ? (
        <div className="mt-3 space-y-2 animate-pulse">
          <div className="h-5 w-full rounded bg-white/10" />
          <div className="h-5 w-4/5 rounded bg-white/10" />
          <div className="h-5 w-2/3 rounded bg-white/10" />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {splitAction(recommendedAction).map((item, i) => (
            <li key={i} className="flex gap-2.5 text-base font-semibold leading-relaxed md:text-lg">
              <span className="mt-[0.35em] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {narrative ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowNarrative((prev) => !prev)}
            className="text-sm font-medium text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/70"
          >
            {showNarrative ? "Hide full AI summary" : "Show full AI summary"}
          </button>
          {showNarrative ? (
            <p className="mt-2 text-sm leading-relaxed text-white/70">{narrative}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
