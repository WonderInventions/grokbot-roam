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
    assert.match(text, /roam-chat/);
  });
});
