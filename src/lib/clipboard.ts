import { Clipboard } from "@raycast/api";

/** Bare API keys look like sk_... / sk-... — never narrate those. */
function looksLikeKey(text: string): boolean {
  return /^sk[-_][A-Za-z0-9_~-]{8,}$/.test(text.trim());
}

/**
 * Read the text to narrate. Guards the classic footgun: user copies their
 * ElevenLabs API key, pastes it into preferences, then runs the command
 * while the key is still the latest clipboard item. In that case we walk
 * back through Raycast clipboard history for the real content instead of
 * reading the secret aloud (and burning credits on it).
 */
export async function resolveClipboardText(
  apiKey: string
): Promise<{ text: string; usedHistory: boolean }> {
  const stored = apiKey.trim();
  const isSecret = (s: string) => s.trim() === stored || looksLikeKey(s);

  const latest = ((await Clipboard.readText()) ?? "").trim();
  if (latest && !isSecret(latest)) return { text: latest, usedHistory: false };

  for (let offset = 1; offset <= 5; offset++) {
    try {
      const candidate = ((await Clipboard.readText({ offset })) ?? "").trim();
      if (candidate && !isSecret(candidate)) {
        // Replace the key sitting on the clipboard with the real content,
        // so the secret is gone and the next run just works.
        await Clipboard.copy(candidate);
        return { text: candidate, usedHistory: true };
      }
    } catch {
      break; // no history / history disabled
    }
  }

  if (latest && isSecret(latest)) {
    throw new Error(
      "Your clipboard currently holds your ElevenLabs API key — I refused to turn it into audio. Copy the text you actually want narrated, then re-run."
    );
  }
  throw new Error("Clipboard is empty. Copy some text first, then run this command.");
}
