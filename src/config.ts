import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Identity } from "./identity.js";

export type Config = {
  token: string;
  baseUrl: string;
  identity?: Identity;
  requireMention?: boolean;
};

export const DEFAULT_BASE_URL = "https://api.ro.am/v1";

export function configDir(): string {
  if (process.env.GROKBOT_ROAM_HOME) {
    return process.env.GROKBOT_ROAM_HOME;
  }
  return join(homedir(), ".grokbot-roam");
}

export function configPath(): string {
  if (process.env.GROKBOT_ROAM_CONFIG) {
    return process.env.GROKBOT_ROAM_CONFIG;
  }
  return join(configDir(), "config.json");
}

export function loadConfig(): Config {
  const path = configPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`No config at ${path}. Run: grokbot-roam configure --token rmp-…|rmk-…`);
    }
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<Config>;
  if (!parsed.token || typeof parsed.token !== "string") {
    throw new Error(`Config at ${path} is missing token`);
  }
  return {
    token: parsed.token,
    baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl ? parsed.baseUrl : DEFAULT_BASE_URL,
    identity: parsed.identity,
    requireMention: parsed.requireMention,
  };
}

export function saveConfig(config: Config): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Best-effort on platforms that ignore directory mode.
  }
  const path = configPath();
  const body = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function shouldRequireMention(config: Config, identity: Identity): boolean {
  if (typeof config.requireMention === "boolean") {
    return config.requireMention;
  }
  return identity.kind === "org";
}
