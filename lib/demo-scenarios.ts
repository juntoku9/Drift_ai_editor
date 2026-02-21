import investmentScenario from "@/demo/scenarios/series_a_investment_memo_realistic.json";
import travelPrdScenario from "@/demo/scenarios/ai_travel_prd_realistic.json";
import acquisitionLegalScenario from "@/demo/scenarios/startup_acquisition_legal_memo_realistic.json";
import apiSpecScenario from "@/demo/scenarios/api_service_engineering_spec_realistic.json";
import type { AnalyzeRequest } from "@/lib/types";
import { analyzeRequestSchema } from "@/lib/ai/schema";

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  payload: AnalyzeRequest;
}

function toScenario(input: unknown): DemoScenario {
  const parsed = input as DemoScenario;
  const validatedPayload = analyzeRequestSchema.parse(parsed.payload);
  return {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    payload: validatedPayload
  };
}

const scenarios: DemoScenario[] = [
  toScenario(investmentScenario),
  toScenario(travelPrdScenario),
  toScenario(acquisitionLegalScenario),
  toScenario(apiSpecScenario)
];

export function listDemoScenarios(): DemoScenario[] {
  return scenarios;
}

export function getDemoScenario(id?: string): DemoScenario {
  if (id) {
    const found = scenarios.find((item) => item.id === id);
    if (found) return found;
  }
  return scenarios[Math.floor(Math.random() * scenarios.length)];
}
