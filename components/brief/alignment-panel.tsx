"use client";

interface Participant {
  name: string;
  role?: string;
  avatarUrl?: string;
}

interface AlignmentPanelProps {
  participants: Participant[];
  keyQuestion: string;
}

/** Strip a trailing parenthetical like "Elena Volkov (CTO)" → "Elena Volkov" */
function cleanName(raw: string) {
  return raw.replace(/\s*\(.*?\)\s*$/, "").trim();
}

export function AlignmentPanel({ participants, keyQuestion }: AlignmentPanelProps) {
  if (participants.length === 0) return null;

  return (
    <section className="panel p-6 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
        Who Needs to Align
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {participants.map((p, i) => (
          <div key={p.name} className="flex items-center gap-2">
            {i > 0 && <span className="text-lg text-ink/25">&harr;</span>}
            {p.avatarUrl ? (
              <img
                src={p.avatarUrl}
                alt={cleanName(p.name)}
                className="h-6 w-6 rounded-full border border-ink/10 object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/10 text-[10px] font-semibold text-ink/60">
                {cleanName(p.name)[0]}
              </span>
            )}
            <span className="text-sm font-semibold">{cleanName(p.name)}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 font-[var(--font-serif)] text-lg leading-relaxed text-ink/90">
        &ldquo;{keyQuestion}&rdquo;
      </p>
    </section>
  );
}
