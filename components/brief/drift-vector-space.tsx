"use client";

/* ── Types ────────────────────────────────────────────────── */

interface StakeholderDrift {
  element: string;
  type: string;
  significance: string;
}

interface StakeholderNode {
  name: string;
  role?: string;
  avatarUrl?: string;
  score: number;
  driftCount: number;
  highCount: number;
  drifts: StakeholderDrift[];
}

interface DriftVectorSpaceProps {
  stakeholders: StakeholderNode[];
}

/* ── Constants ────────────────────────────────────────────── */

const DIRECTION: Record<string, string> = {
  strengthened: "↑",
  weakened: "↓",
  shifted: "→",
  appeared: "+",
  disappeared: "−",
};

const SIG_CHIP: Record<string, string> = {
  high: "border-ember/25 bg-ember/8 text-ember",
  medium: "border-amber-500/25 bg-amber-500/8 text-amber-600",
  low: "border-olive/25 bg-olive/8 text-olive",
};

/* ── Tension detection ────────────────────────────────────── */

interface Tension {
  element: string;
  a: { name: string; type: string };
  b: { name: string; type: string };
}

function areOpposing(a: string, b: string) {
  return (
    (a === "strengthened" && b === "weakened") ||
    (a === "weakened" && b === "strengthened") ||
    (a === "appeared" && b === "disappeared") ||
    (a === "disappeared" && b === "appeared")
  );
}

function detectTensions(stakeholders: StakeholderNode[]): Tension[] {
  const byElement = new Map<string, { name: string; type: string }[]>();
  for (const s of stakeholders) {
    for (const d of s.drifts) {
      const list = byElement.get(d.element) ?? [];
      list.push({ name: s.name, type: d.type });
      byElement.set(d.element, list);
    }
  }
  const tensions: Tension[] = [];
  for (const [element, entries] of byElement) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (areOpposing(entries[i].type, entries[j].type)) {
          tensions.push({ element, a: entries[i], b: entries[j] });
        }
      }
    }
  }
  return tensions;
}

/* ── Component ────────────────────────────────────────────── */

export function DriftVectorSpace({ stakeholders }: DriftVectorSpaceProps) {
  if (stakeholders.length === 0) return null;

  const maxScore = Math.max(...stakeholders.map((s) => s.score), 1);
  const tensions = detectTensions(stakeholders);
  const tensionElements = new Set(tensions.map((t) => t.element));

  return (
    <section className="panel p-6 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
        Stakeholder Impact
      </p>

      <div className="mt-4 space-y-5">
        {stakeholders.map((s, i) => {
          const pct = maxScore > 0 ? s.score / maxScore : 0;
          const barColor =
            s.score === 0
              ? "bg-ink/15"
              : pct >= 0.66
                ? "bg-ember"
                : pct >= 0.33
                  ? "bg-amber-500"
                  : "bg-olive";

          return (
            <div key={s.name} className="flex items-start gap-3">
              {/* Rank */}
              <span className="mt-0.5 w-6 shrink-0 text-right text-xs font-bold text-ink/40">
                #{i + 1}
              </span>

              {/* Avatar */}
              {s.avatarUrl ? (
                <img
                  src={s.avatarUrl}
                  alt={s.name}
                  className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-ink/10 object-cover"
                />
              ) : (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-ink/70">
                  {s.name[0]}
                </span>
              )}

              {/* Details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  {s.role && <span className="text-xs text-ink/55">{s.role}</span>}
                </div>

                {/* Score bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: s.score === 0 ? "0%" : `${Math.max(pct * 100, 5)}%` }}
                    />
                  </div>
                  <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-ink/70">
                    {s.score}
                  </span>
                </div>

                {/* Drift element chips OR baseline */}
                {s.score === 0 ? (
                  <p className="mt-1.5 text-[11px] text-ink/40">baseline</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.drifts.map((d, di) => {
                      const chip = SIG_CHIP[d.significance] ?? SIG_CHIP.low;
                      const icon = DIRECTION[d.type] ?? "·";
                      const tense = tensionElements.has(d.element);
                      return (
                        <span
                          key={di}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${chip}${tense ? " ring-1 ring-ember/30" : ""}`}
                        >
                          <span className="font-bold">{icon}</span>
                          {d.element}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tensions */}
      {tensions.length > 0 && (
        <div className="mt-5 space-y-1.5 rounded-lg border border-ember/15 bg-ember/[0.03] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ember/70">
            Tensions
          </p>
          {tensions.map((t, ti) => (
            <p key={ti} className="text-xs text-ink/60">
              <span className="font-semibold text-ink/75">{t.element}</span>
              {" — "}
              <span>
                {t.a.name.split(" ")[0]}&nbsp;{DIRECTION[t.a.type]}
                {" ↔ "}
                {t.b.name.split(" ")[0]}&nbsp;{DIRECTION[t.b.type]}
              </span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
