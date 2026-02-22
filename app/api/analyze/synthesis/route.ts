import { NextResponse } from "next/server";
import { z } from "zod";

import { synthesizeAnalysis } from "@/lib/ai/client";

const synthRequestSchema = z.object({
  title: z.string().optional(),
  template: z.enum(["product_spec", "contract", "prd", "memo"]).optional(),
  versions: z.array(
    z.object({
      version: z.string(),
      author_name: z.string().optional(),
      author_role: z.string().optional()
    })
  ),
  drifts: z.array(
    z.object({
      id: z.string(),
      element: z.string(),
      type: z.enum(["strengthened", "weakened", "shifted", "appeared", "disappeared"]),
      from_version: z.string(),
      to_version: z.string(),
      from_text: z.string(),
      to_text: z.string(),
      significance: z.enum(["low", "medium", "high"]),
      explanation: z.string(),
      question_to_ask: z.string()
    })
  )
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = synthRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
    const result = await synthesizeAnalysis(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed.";
    console.error("[api.analyze.synthesis] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
