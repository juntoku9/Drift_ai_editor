import { NextResponse } from "next/server";

import { getDemoScenario, listDemoScenarios } from "@/lib/demo-scenarios";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? undefined;
  const scenario = getDemoScenario(id);
  return NextResponse.json({
    scenario: {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description
    },
    scenarios: listDemoScenarios().map((item) => ({
      id: item.id,
      name: item.name
    })),
    ...scenario.payload
  });
}
