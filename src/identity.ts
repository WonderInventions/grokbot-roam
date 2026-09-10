export type IdentityKind = "pat" | "org";

export type Identity = {
  kind: IdentityKind;
  botId: string | null;
  botName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  scopes: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Populate bot + owner identity from a `/v1/token.info` response.
 *
 * PAT: `bot` is the persona (self-echo / mention id), `user` is the owner.
 * Org: `bot` is omitted and `user` IS the bot.
 */
export function identityFromTokenInfo(info: unknown): Identity {
  const root = asRecord(info) ?? {};
  const user = asRecord(root.user) ?? {};
  const bot = asRecord(root.bot) ?? {};
  const scopes = Array.isArray(root.scopes)
    ? root.scopes.filter((s): s is string => typeof s === "string")
    : [];

  if (bot.id || bot.name) {
    return {
      kind: "pat",
      botId: str(bot.id),
      botName: str(bot.name),
      ownerId: str(user.id),
      ownerName: str(user.name),
      ownerEmail: str(user.email),
      scopes,
    };
  }

  return {
    kind: "org",
    botId: str(user.id),
    botName: str(user.name),
    ownerId: null,
    ownerName: null,
    ownerEmail: null,
    scopes,
  };
}
