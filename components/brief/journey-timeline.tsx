"use client";

import type { DriftItem, SemanticVersion } from "@/lib/types";

interface Actor {
  name: string;
  role?: string;
  avatarUrl?: string;
}

interface TransitionActorPair {
  fromAuthor?: string;
  toAuthor?: string;
  fromRole?: string;
  toRole?: string;
  fromAvatarUrl?: string;
  toAvatarUrl?: string;
}

interface JourneyTimelineProps {
  versions: SemanticVersion[];
  drifts: DriftItem[];
  inflectionPoint: string;
  actors: Record<string, Actor>;
  transitionActors: Record<string, TransitionActorPair>;
}

const DIRECTION: Record<string, string> = {
  strengthened: "raised",
  weakened: "lowered",
  shifted: "shifted",
  appeared: "new",
  disappeared: "removed",
};

const SIG_CHIP: Record<string, string> = {
  high: "border-ember/25 bg-ember/8 text-ember",
  medium: "border-amber-500/25 bg-amber-500/8 text-amber-600",
  low: "border-olive/25 bg-olive/8 text-olive",
};

function isInflection(transitionLabel: string, inflectionPoint: string): boolean {
  return (
    transitionLabel.replace(/\s+/g, "").toLowerCase() ===
    inflectionPoint.replace(/\s+/g, "").toLowerCase()
  );
}

function sigWeight(value: DriftItem["significance"]): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

export function JourneyTimeline({
  versions,
  drifts,
  inflectionPoint,
  actors,
}: JourneyTimelineProps) {
  if (!versions.length) return null;

  /* Pre-compute max transition score for bar scaling */
  const transitionScores = versions.slice(1).map((v, i) => {
    const from = versions[i].version;
    return drifts
      .filter((d) => d.from_version === from && d.to_version === v.version)
      .reduce((s, d) => s + sigWeight(d.significance), 0);
  });
  const maxScore = Math.max(...transitionScores, 1);

  return (
    <section className="panel p-6 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
        The Full Journey
      </p>

      <div className="mt-5">
        {versions.map((version, index) => {
          const actor = actors[version.version];
          const transitionLabel =
            index > 0
              ? `${versions[index - 1].version} -> ${version.version}`
              : "";
          const inflection = index > 0 && isInflection(transitionLabel, inflectionPoint);
          const relatedDrifts =
            index > 0
              ? drifts
                  .filter(
                    (d) =>
                      d.from_version === versions[index - 1].version &&
                      d.to_version === version.version
                  )
                  .sort((a, b) => sigWeight(b.significance) - sigWeight(a.significance))
              : [];
          const top3 = relatedDrifts.slice(0, 3);
          const overflow = relatedDrifts.length - 3;
          const score = relatedDrifts.reduce((s, d) => s + sigWeight(d.significance), 0);

          return (
            <div key={version.version}>
              {/* ── Transition zone ────────────────────────── */}
              {index > 0 && (
                <div className="ml-[15px] flex items-stretch gap-4 py-2">
                  <div
                    className={`w-px shrink-0 ${inflection ? "bg-ember" : "bg-ink/12"}`}
                  />
                  <div className="flex-1 py-2">
                    {inflection && (
                      <span className="mb-2 inline-block rounded-full bg-ember px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                        Turning Point
                      </span>
                    )}
                    {top3.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {top3.map((drift) => {
                          const chip = SIG_CHIP[drift.significance] ?? SIG_CHIP.low;
                          const icon = DIRECTION[drift.type] ?? "·";
                          return (
                            <span
                              key={drift.id}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${chip}`}
                            >
                              <span className="font-semibold opacity-70">{icon}</span>
                              <span className="font-medium">{drift.element}</span>
                            </span>
                          );
                        })}
                        {overflow > 0 && (
                          <span className="text-xs text-ink/40">
                            +{overflow} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Version node ───────────────────────────── */}
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    inflection ? "bg-ember" : "bg-ink"
                  }`}
                >
                  {version.version}
                </span>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-1.5">
                    {actor?.avatarUrl ? (
                      <img
                        src={actor.avatarUrl}
                        alt={actor.name}
                        className="h-5 w-5 rounded-full border border-ink/10 object-cover"
                      />
                    ) : null}
                    <span className="text-sm font-semibold">
                      {actor?.name ?? "Unknown"}
                    </span>
                    {actor?.role ? (
                      <span className="text-xs text-ink/50">{actor.role}</span>
                    ) : null}
                    {index > 0 && (
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.06]">
                          <span
                            className={`block h-full rounded-full ${
                              score / maxScore >= 0.66
                                ? "bg-ember"
                                : score / maxScore >= 0.33
                                  ? "bg-amber-500"
                                  : "bg-olive"
                            }`}
                            style={{ width: score === 0 ? "0%" : `${Math.max((score / maxScore) * 100, 8)}%` }}
                          />
                        </span>
                        <span className="text-xs font-bold tabular-nums text-ink/50">{score}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-ink/65">
                    {version.intent.primary_goal}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
