export const templateVariables = [
  "firstName",
  "customerName",
  "inquiryNumber",
  "serviceType",
  "repName",
  "subject",
] as const;

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? "");
}
