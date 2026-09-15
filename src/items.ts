import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type WakeItem = {
  id: string;
  type: string;
  name: string;
  url: string;
  mime?: string;
  thumbnail?: string;
  size?: number;
  localPath?: string;
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

export function parseWakeItems(raw: unknown): WakeItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: WakeItem[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    if (!rec) {
      continue;
    }
    const id = asString(rec.id);
    const name = asString(rec.name);
    const url = asString(rec.url);
    if (!id || !name || !url) {
      continue;
    }
    const item: WakeItem = {
      id,
      type: asString(rec.type) || "blob",
      name,
      url,
    };
    const mime = asString(rec.mime);
    if (mime) {
      item.mime = mime;
    }
    const thumbnail = asString(rec.thumbnail);
    if (thumbnail) {
      item.thumbnail = thumbnail;
    }
    const size = asInt(rec.size);
    if (size !== undefined) {
      item.size = size;
    }
    out.push(item);
  }
  return out;
}

export function safeFilename(name: string, fallback: string): string {
  const base = basename(name).replace(/[/\\]/g, "_").replace(/^\.+/, "") || fallback;
  return base.slice(0, 200);
}

export async function downloadWakeItems(
  items: WakeItem[],
  dir: string,
  opts: { token: string; fetch?: typeof fetch },
): Promise<WakeItem[]> {
  mkdirSync(dir, { recursive: true });
  const fetchImpl = opts.fetch ?? fetch;
  const result: WakeItem[] = [];
  for (const [i, item] of items.entries()) {
    const next: WakeItem = { ...item };
    if (item.size !== undefined && item.size > MAX_ATTACHMENT_BYTES) {
      next.error = `too_large:${item.size}`;
      result.push(next);
      continue;
    }
    try {
      const resp = await fetchImpl(item.url, {
        headers: { Authorization: `Bearer ${opts.token}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) {
        next.error = `http_${resp.status}`;
        result.push(next);
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
        next.error = `too_large:${buf.byteLength}`;
        result.push(next);
        continue;
      }
      const filename = safeFilename(item.name, `item-${i + 1}`);
      const localPath = join(dir, `${i + 1}-${filename}`);
      writeFileSync(localPath, buf);
      next.localPath = localPath;
      next.size = buf.byteLength;
    } catch (err) {
      next.error = err instanceof Error ? err.message.slice(0, 120) : "download_failed";
    }
    result.push(next);
  }
  return result;
}

export function contentTypeForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "application/octet-stream";
}
