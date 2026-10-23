const GRAPH = "https://graph.microsoft.com/v1.0";

let cachedToken: { value: string; expiresAt: number } | null = null;

export const graphConfigured = () =>
  Boolean(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET);

export const mailbox = () => process.env.GRAPH_MAILBOX ?? "quotes@outsourcelogistics.com";

/** App-only token via the OAuth client credentials grant. Requires Mail.Read + Mail.Send application permissions. */
async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GRAPH_CLIENT_ID!,
      client_secret: process.env.GRAPH_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

export class GraphError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function graphFetch<T = unknown>(
  pathOrUrl: string,
  init: RequestInit & { preferText?: boolean } = {},
): Promise<T> {
  const { preferText, ...rest } = init;
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${await getToken()}`);
  if (rest.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (preferText) headers.set("Prefer", 'outlook.body-content-type="text"');

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...rest, headers });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("Retry-After") ?? 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new GraphError(res.status, `Graph ${rest.method ?? "GET"} ${url}: ${res.status} ${await res.text()}`);
    if (res.status === 202 || res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export const mailboxPath = () => `/users/${encodeURIComponent(mailbox())}`;
