/** Never print Roam tokens or Grok sender keys. */
export function redact(text: string, extra?: string): string {
  let out = text;
  if (extra) {
    out = out.split(extra).join("[redacted]");
  }
  out = out.replace(/\brm[pk]-[A-Za-z0-9._~+/-]+\b/g, "[redacted]");
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return out;
}
