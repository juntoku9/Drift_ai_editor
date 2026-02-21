import { NextResponse } from "next/server";

import { analyzeDocument } from "@/lib/ai/client";
import { analyzeRequestSchema } from "@/lib/ai/schema";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = analyzeRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request payload.",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const analysis = await analyzeDocument(parsed.data);
    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
