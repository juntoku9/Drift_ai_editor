"use client";

interface VerdictHeaderProps {
  title: string;
  headline: string;
  driftScore: number;
  synthesisPending?: boolean;
  onBack: () => void;
  onBackToLibrary?: () => void;
}

function severityDots(score: number): { filled: number; label: string; color: string } {
  if (score >= 66) return { filled: 4, label: "High drift", color: "bg-ember" };
  if (score >= 36) return { filled: 3, label: "Moderate drift", color: "bg-amber-500" };
  return { filled: 2, label: "Low drift", color: "bg-olive" };
}

export function VerdictHeader({ title, headline, driftScore, synthesisPending, onBack, onBackToLibrary }: VerdictHeaderProps) {
  const severity = severityDots(driftScore);

  return (
    <header className="space-y-3 py-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
          {title}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold hover:bg-ink/5"
        >
          ← Back to Editor
        </button>
      </div>

      {synthesisPending ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-3/4 rounded-lg bg-ink/10" />
          <div className="h-7 w-1/2 rounded-lg bg-ink/8" />
        </div>
      ) : (
        <h2 className="whitespace-pre-line font-[var(--font-serif)] text-2xl leading-snug md:text-3xl">
          {headline}
        </h2>
      )}

      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((dot) => (
            <span
              key={dot}
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                dot <= severity.filled ? severity.color : "bg-ink/15"
              }`}
            />
          ))}
        </div>
        <span className="text-sm font-medium text-ink/70">{severity.label}</span>
      </div>
    </header>
  );
}
