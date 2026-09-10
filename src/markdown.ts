/**
 * Markdown helpers ported from hermes-roam/adapter.py.
 *
 * Mention pattern used by Roam clients: <@uuid> or <!@uuid>.
 */
export const BOT_MENTION_RE = /<!?@([0-9a-f-]+)>/gi;

/** Fenced code-block delimiter (``` or ~~~) with optional leading whitespace. */
const FENCE_RE = /^(\s*)(```|~~~)/;

/**
 * Normalize Markdown for Roam's renderer.
 *
 * Two transformations, both applied outside fenced code blocks only:
 *
 * 1. Insert blank lines between non-empty consecutive lines so each line
 *    renders as its own paragraph. Roam treats a single newline as a soft
 *    break that collapses to a space.
 *
 * 2. De-indent fenced code blocks. The agent often emits 4-space indented
 *    fences inside list items. Roam's renderer mis-parses these as inline
 *    code spans; stripping the fence's leading whitespace makes it a block.
 */
export function expandSoftBreaks(text: string): string {
  if (!text) {
    return text;
  }
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = FENCE_RE.exec(line);
    // FENCE_RE is not global; still reset in case of reuse.
    FENCE_RE.lastIndex = 0;
    if (m) {
      if (!inFence) {
        fenceIndent = m[1]!.length;
        out.push(line.slice(fenceIndent));
      } else {
        const stripped = line.slice(0, fenceIndent).replace(/^\s+/, "") + line.slice(fenceIndent);
        out.push(stripped);
        fenceIndent = 0;
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (fenceIndent && line.slice(0, fenceIndent).trim() === "") {
        out.push(line.slice(fenceIndent));
      } else {
        out.push(line);
      }
      continue;
    }
    out.push(line);
    if (i + 1 >= lines.length) {
      continue;
    }
    if (line.trim() && lines[i + 1]!.trim()) {
      out.push("");
    }
  }
  return out.join("\n");
}

/** Strip the bot's own `<@uuid>` mention from inbound text. */
export function stripBotMention(text: string, botId: string | null | undefined): string {
  if (!text) {
    return text;
  }
  if (botId) {
    const escaped = botId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`<!?@${escaped}>`, "gi"), "");
  }
  return text.trim();
}

/** Return true if the bot's UUID appears in a `<@uuid>` mention. */
export function wasBotMentioned(text: string, botId: string | null | undefined): boolean {
  if (!botId || !text) {
    return false;
  }
  const re = new RegExp(BOT_MENTION_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]!.toLowerCase() === botId.toLowerCase()) {
      return true;
    }
  }
  return false;
}
