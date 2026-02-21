import type { DomainTemplate } from "@/lib/types";

export const templateOptions: Array<{ value: DomainTemplate; label: string; description: string }> = [
  {
    value: "product_spec",
    label: "Product Spec",
    description: "Track goals, launch commitments, scope boundaries, and user focus."
  },
  {
    value: "contract",
    label: "Contract",
    description: "Track obligations, liability, carve-outs, payment terms, and remedies."
  },
  {
    value: "prd",
    label: "PRD",
    description: "Track product requirements, acceptance criteria, assumptions, and metrics."
  },
  {
    value: "memo",
    label: "Memo",
    description: "Track claims, recommendations, confidence, and decision framing."
  }
];

export function getTemplateLabel(template: DomainTemplate): string {
  const option = templateOptions.find((item) => item.value === template);
  return option?.label ?? "Template";
}

export function getTemplateGuidance(template: DomainTemplate): string {
  switch (template) {
    case "contract":
      return "Prioritize obligations, rights, liability, indemnity, termination, and ambiguity in legal commitments.";
    case "prd":
      return "Prioritize requirements clarity, acceptance criteria, technical constraints, and measurable success criteria.";
    case "memo":
      return "Prioritize argument strength, recommendation clarity, risk framing, and confidence shifts.";
    case "product_spec":
    default:
      return "Prioritize product goals, delivery commitments, scope discipline, target users, and execution certainty.";
  }
}
