import { Clipboard } from "@raycast/api";

/** Bare API keys look like sk_... or sk-...; never narrate those. */
function looksLikeKey(text: string): boolean {
  return /^sk[-_][A-Za-z0-9_~-]{8,}$/.test(text.trim());
}

/**
 * Read the text to narrate. If the latest clipboard item is the ElevenLabs
 * key (copied while setting up the extension), walk back through Raycast
 * clipboard history instead of reading the secret aloud, and put the real
 * text back on the clipboard so the key is gone.
 */
export async function resolveClipboardText(
  apiKey: string
): Promise<{ text: string; skippedKey: boolean }> {
  const isSecret = (s: string) => s.trim() === apiKey.trim() || looksLikeKey(s);

  const current = await Clipboard.read();
  const latest = (current.text ?? "").trim();
  // Copied files also report their name as text, so check the file first.
  if (current.file) {
    throw new Error("The clipboard holds an image or file. Copy some text and run this again.");
  }
  if (latest && !isSecret(latest)) return { text: latest, skippedKey: false };

  if (latest) {
    for (let offset = 1; offset <= 5; offset++) {
      const candidate = (
        (await Clipboard.readText({ offset }).catch(() => undefined)) ?? ""
      ).trim();
      if (candidate && !isSecret(candidate)) {
        await Clipboard.copy(candidate);
        return { text: candidate, skippedKey: true };
      }
    }
    throw new Error(
      "The clipboard holds your ElevenLabs key, so RayVoice won't read it. Copy the text you want narrated and run this again."
    );
  }
  throw new Error("The clipboard is empty. Copy some text and run this again.");
}
