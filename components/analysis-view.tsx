"use client";

import { useMemo } from "react";

import { ActionCard } from "@/components/brief/action-card";
import { AlignmentPanel } from "@/components/brief/alignment-panel";
import { JourneyTimeline } from "@/components/brief/journey-timeline";
import { TurningPoint } from "@/components/brief/turning-point";
import { VerdictHeader } from "@/components/brief/verdict-header";
import type { AnalysisResult, DriftItem, EditorSnapshot } from "@/lib/types";

interface AnalysisViewProps {
  title: string;
  analysis: AnalysisResult;
  snapshots: EditorSnapshot[];
  synthesisPending?: boolean;
  onBack: () => void;
  onBackToLibrary?: () => void;
  transitionActors?: Record<
    string,
    {
      fromAuthor?: string;
      toAuthor?: string;
      fromRole?: string;
      toRole?: string;
      fromHandle?: string;
      toHandle?: string;
      fromAvatarUrl?: string;
      toAvatarUrl?: string;
    }
  >;
}

export function AnalysisView({
  title,
  analysis,
  snapshots,
  synthesisPending,
  onBack,
  onBackToLibrary,
  transitionActors
}: AnalysisViewProps) {
  const transitions = useMemo(() => {
    return analysis.versions.slice(1).map((toVersion, index) => {
      const fromVersion = analysis.versions[index];
      const transitionLabel = `${fromVersion.version} -> ${toVersion.version}`;
      const relatedDrifts = analysis.drifts.filter(
        (drift) =>
          drift.from_version === fromVersion.version && drift.to_version === toVersion.version
      );
      const topDrift =
        [...relatedDrifts].sort(
          (a, b) => rankSignificance(b.significance) - rankSignificance(a.significance)
        )[0] ?? null;
      const inflection =
        transitionLabel.replace(/\s+/g, "").toLowerCase() ===
        analysis.inflection_point.replace(/\s+/g, "").toLowerCase();
      return { transitionLabel, fromVersion, toVersion, relatedDrifts, topDrift, inflection };
    });
  }, [analysis.versions, analysis.drifts, analysis.inflection_point]);

  const inflectionTransition = transitions.find((t) => t.inflection) ?? transitions[0] ?? null;

  /* Focused pair: only the 2 people from the inflection transition */
  const focusedParticipants = useMemo(() => {
    if (!inflectionTransition) return [];
    const ta = transitionActors?.[inflectionTransition.transitionLabel];
    const list: { name: string; role?: string; avatarUrl?: string }[] = [];
    const seen = new Set<string>();

    if (ta?.fromAuthor && !seen.has(ta.fromAuthor)) {
      seen.add(ta.fromAuthor);
      list.push({ name: ta.fromAuthor, role: ta.fromRole, avatarUrl: ta.fromAvatarUrl });
    }
    if (ta?.toAuthor && !seen.has(ta.toAuthor)) {
      seen.add(ta.toAuthor);
      list.push({ name: ta.toAuthor, role: ta.toRole, avatarUrl: ta.toAvatarUrl });
    }

    /* Fallback: derive from snapshots if transition actors aren't available */
    if (list.length === 0) {
      const seenSnap = new Set<string>();
      for (const snap of snapshots) {
        const name = snap.createdByName;
        if (!name || seenSnap.has(name)) continue;
        seenSnap.add(name);
        list.push({ name, role: snap.createdByRole, avatarUrl: snap.createdByAvatarUrl });
      }
    }

    return list;
  }, [inflectionTransition, transitionActors, snapshots]);

  const keyQuestion =
    inflectionTransition?.topDrift?.question_to_ask ??
    analysis.drifts.find((d) => d.significance === "high")?.question_to_ask ??
    "Are all stakeholders aligned on the current direction?";

  const versionActors = useMemo(() => {
    const map: Record<string, { name: string; role?: string; avatarUrl?: string }> = {};
    for (const snap of snapshots) {
      const vLabel = `V${snapshots.indexOf(snap) + 1}`;
      map[vLabel] = {
        name: snap.createdByName ?? "Unknown",
        role: snap.createdByRole,
        avatarUrl: snap.createdByAvatarUrl
      };
    }
    return map;
  }, [snapshots]);

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <VerdictHeader
        title={title}
        headline={analysis.headline}
        driftScore={analysis.drift_score}
        synthesisPending={synthesisPending}
        onBack={onBack}
        onBackToLibrary={onBackToLibrary}
      />

      <JourneyTimeline
        versions={analysis.versions}
        drifts={analysis.drifts}
        inflectionPoint={analysis.inflection_point}
        actors={versionActors}
        transitionActors={transitionActors ?? {}}
      />

      {inflectionTransition ? (
        <TurningPoint
          transitionLabel={inflectionTransition.transitionLabel}
          explanation={
            inflectionTransition.topDrift?.explanation ??
            "A significant directional change occurred at this transition."
          }
          fromText={inflectionTransition.topDrift?.from_text ?? inflectionTransition.fromVersion.intent.primary_goal}
          toText={inflectionTransition.topDrift?.to_text ?? inflectionTransition.toVersion.intent.primary_goal}
          actorName={transitionActors?.[inflectionTransition.transitionLabel]?.toAuthor}
          actorRole={transitionActors?.[inflectionTransition.transitionLabel]?.toRole}
          actorAvatarUrl={transitionActors?.[inflectionTransition.transitionLabel]?.toAvatarUrl}
        />
      ) : null}

      <AlignmentPanel participants={focusedParticipants} keyQuestion={keyQuestion} />

      <ActionCard
        recommendedAction={analysis.recommended_action}
        narrative={analysis.narrative}
        synthesisPending={synthesisPending}
      />
    </section>
  );
}

function rankSignificance(value: DriftItem["significance"]): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}
