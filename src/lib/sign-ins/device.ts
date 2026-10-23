const browsers: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

const systems: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

const match = (ua: string, list: [RegExp, string][]) => list.find(([re]) => re.test(ua))?.[1];

/** Short, human-readable device label such as "Chrome on Windows". */
export function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device";
  const browser = match(userAgent, browsers);
  const system = match(userAgent, systems);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}

export function describeLocation(e: { city: string | null; region: string | null; country: string | null }) {
  return [e.city, e.region, e.country].filter(Boolean).join(", ") || null;
}
