import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { onboardPlaybook } from "./onboard.js";

describe("onboardPlaybook", () => {
  it("embeds both skills so a Grok Bot session can connect without extra docs", () => {
    const text = onboardPlaybook();
    assert.match(text, /secret-request/i);
    assert.match(text, /npx @roamhq\/grokbot@latest configure/);
    assert.match(text, /npx @roamhq\/grokbot subscribe/);
    assert.match(text, /handle-wake/);
    assert.match(text, /--text-file/);
    assert.match(text, /--download-dir/);
    assert.match(text, /--asset-id/);
    assert.match(text, /roam-chat/);
    assert.match(text, /Meetings Read/);
    assert.match(text, /meetings:read/);
    assert.match(text, /custom MCP server called roam/);
    assert.match(text, /meeting_search/);
    assert.match(text, /reaction_add/);
    assert.match(text, /history\?/);
  });
});
