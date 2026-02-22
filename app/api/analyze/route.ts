import { NextResponse } from "next/server";

import { analyzeTransitions } from "@/lib/ai/client";
import { analyzeRequestSchema } from "@/lib/ai/schema";

export async function POST(request: Request) {
  const requestId = `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const payload = await request.json();
    const parsed = analyzeRequestSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("[api.analyze] invalid_payload", {
        requestId,
        issues: parsed.error.issues.length
      });
      return NextResponse.json(
        {
          error: "Invalid request payload.",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    console.info("[api.analyze] start", {
      requestId,
      versions: parsed.data.versions.length,
      template: parsed.data.template ?? "product_spec"
    });
    const analysis = await analyzeTransitions(parsed.data);
    if (analysis.diagnostics?.fallback_used) {
      console.warn("[api.analyze] completed_with_fallback", {
        requestId,
        transitionFailures: analysis.diagnostics.transition_model_failures,
        transitionErrors: analysis.diagnostics.transition_errors ?? []
      });
    } else {
      console.info("[api.analyze] completed", { requestId });
    }
    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis error.";
    console.error("[api.analyze] failed", { requestId, message });
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
