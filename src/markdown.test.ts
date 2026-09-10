import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandSoftBreaks, stripBotMention, wasBotMentioned } from "./markdown.js";

const BOT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("expandSoftBreaks", () => {
  it("inserts blank lines between consecutive non-empty lines", () => {
    assert.equal(expandSoftBreaks("a\nb\nc"), "a\n\nb\n\nc");
  });

  it("preserves existing paragraphs", () => {
    assert.equal(expandSoftBreaks("a\n\nb"), "a\n\nb");
  });

  it("preserves fenced code blocks", () => {
    const src = "Run this:\n```sh\nls -la\necho hi\n```\nDone.";
    const out = expandSoftBreaks(src);
    assert.ok(out.includes("```sh\nls -la\necho hi\n```"));
    assert.ok(out.startsWith("Run this:\n\n```sh"));
  });

  it("handles tilde fences", () => {
    const src = "before\n~~~\ncode line\n~~~\nafter";
    const out = expandSoftBreaks(src);
    assert.ok(out.includes("~~~\ncode line\n~~~"));
  });

  it("is a no-op on empty and single-line text", () => {
    assert.equal(expandSoftBreaks(""), "");
    assert.equal(expandSoftBreaks("single line"), "single line");
  });

  it("de-indents a fence inside a list item", () => {
    const src = "1. Run this:\n   ```bash\n   hermes setup\n   ```\n   Continue.";
    const out = expandSoftBreaks(src);
    assert.ok(out.includes("\n```bash\nhermes setup\n```\n"));
  });

  it("handles a four-space indented fence", () => {
    const src = "- Item:\n    ```\n    code\n    ```";
    const out = expandSoftBreaks(src);
    assert.ok(out.includes("\n```\ncode\n```"));
  });

  it("preserves relative indent inside a fence", () => {
    const src = "   ```py\n   def f():\n       return 1\n   ```";
    const out = expandSoftBreaks(src);
    assert.ok(out.includes("```py\ndef f():\n    return 1\n```"));
  });

  it("leaves an unindented fence unchanged", () => {
    const src = "before\n```sh\nrun\n```\nafter";
    const out = expandSoftBreaks(src);
    assert.ok(out.includes("```sh\nrun\n```"));
  });
});

describe("mentions", () => {
  it("strips only the bot mention", () => {
    assert.equal(
      stripBotMention(`<@${BOT_ID}> hello <@${OTHER_ID}>`, BOT_ID),
      `hello <@${OTHER_ID}>`,
    );
  });

  it("strips the <!@uuid> form", () => {
    assert.equal(stripBotMention(`<!@${BOT_ID}> ping`, BOT_ID), "ping");
  });

  it("detects a matching mention", () => {
    assert.equal(wasBotMentioned(`hi <@${BOT_ID}>`, BOT_ID), true);
  });

  it("ignores other users", () => {
    assert.equal(wasBotMentioned(`hi <@${OTHER_ID}>`, BOT_ID), false);
  });

  it("is false without a bot id", () => {
    assert.equal(wasBotMentioned(`hi <@${BOT_ID}>`, null), false);
  });
});
