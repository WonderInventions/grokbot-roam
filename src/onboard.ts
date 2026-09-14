import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

/** Playbook printed into a Grok Bot session via `npx @roamhq/grokbot onboard`. */
export function onboardPlaybook(): string {
  const root = packageRoot();
  const channel = readFileSync(join(root, "skills/roam-channel/SKILL.md"), "utf8");
  const chat = readFileSync(join(root, "skills/roam-chat/SKILL.md"), "utf8");
  return `Follow this playbook now. Ask the human only for secrets (Roam token, then routine URL + sender key). Never echo secrets.

${channel}

---

Use this as the ONE inbound webhook routine prompt (verbatim):

${chat}
`;
}
