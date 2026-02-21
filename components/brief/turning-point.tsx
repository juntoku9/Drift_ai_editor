"use client";

interface TurningPointProps {
  transitionLabel: string;
  explanation: string;
  fromText: string;
  toText: string;
  actorName?: string;
  actorRole?: string;
  actorAvatarUrl?: string;
}

export function TurningPoint({
  transitionLabel,
  explanation,
  fromText,
  toText,
  actorName,
  actorRole,
  actorAvatarUrl
}: TurningPointProps) {
  return (
    <section className="border-l-4 border-ember pl-5 md:pl-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
        The Turning Point
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-ink/20 px-3 py-1 text-sm font-semibold">
          {transitionLabel}
        </span>
        {actorAvatarUrl ? (
          <div className="flex items-center gap-2">
            <img
              src={actorAvatarUrl}
              alt={actorName ?? "Editor"}
              className="h-7 w-7 rounded-full border border-ink/10 object-cover"
            />
            <span className="text-sm text-ink/80">
              {actorName}{actorRole ? ` (${actorRole})` : ""}
            </span>
          </div>
        ) : actorName ? (
          <span className="text-sm text-ink/80">
            {actorName}{actorRole ? ` (${actorRole})` : ""}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink/85">{explanation}</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="text-ink/50 line-through">&ldquo;{fromText}&rdquo;</span>
        <span className="text-ink/40">&rarr;</span>
        <span className="font-semibold text-ink/90">&ldquo;{toText}&rdquo;</span>
      </div>
    </section>
  );
}
