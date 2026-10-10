import type { DialogueTurn } from "./elevenlabs";

/** Strip markdown-ish noise so TTS doesn't read out URLs/formatting literally. */
export function cleanForSpeech(raw: string): string {
  return (
    raw
      // markdown links [label](url) -> label
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      // bare urls -> dropped (narrator shouldn't spell them)
      .replace(/https?:\/\/\S+/g, "")
      // images ![alt](...) -> alt
      .replace(/!\[([^\]]*)\][^\s]*/g, "$1")
      // headings / quotes / bullets / code fences
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/```[\s\S]*?```/g, " code sample omitted ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

/**
 * Turn plain clipboard text into a 2-host podcast script.
 * Heuristic (no LLM needed): intro -> alternate sentence groups -> outro.
 * Keeps Eleven v4 audio tags so delivery is expressive.
 */
export function buildPodcastScript(
  rawText: string,
  voiceA: string,
  voiceB: string
): { turns: DialogueTurn[]; readable: string } {
  const clean = cleanForSpeech(rawText);
  const sentences = clean
    .match(/[^.!?]+[.!?]+["”']?\s*|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [clean];

  // Group sentences into ~280-char turns for natural pacing.
  const groups: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length <= 280) {
      buf = buf ? buf + " " + s : s;
    } else {
      if (buf) groups.push(buf);
      buf = s;
    }
  }
  if (buf) groups.push(buf);

  const turns: DialogueTurn[] = [
    {
      text: "[excited] Welcome back to RayVoice, the podcast where your clipboard becomes the episode! [friendly] I'm Alex.",
      voice_id: voiceA,
    },
    {
      text: "[cheerful] And I'm Sam! Today's episode comes straight from something you just copied. Let's get into it.",
      voice_id: voiceB,
    },
  ];

  groups.forEach((g, i) => {
    const voice = i % 2 === 0 ? voiceA : voiceB;
    const lead =
      i === 0
        ? "[curious] So here's what you grabbed: "
        : i % 2 === 0
          ? "[thoughtful] And building on that: "
          : "[surprised] Oh, this part is interesting: ";
    turns.push({ text: `${lead}${g}`, voice_id: voice });
  });

  turns.push({
    text: "[warm] That's the episode! Copy something else anytime and we'll turn it into audio. [friendly] See you next time!",
    voice_id: voiceB,
  });

  const readable = turns.map((t, i) => `${i % 2 === 0 ? "Alex" : "Sam"}: ${t.text}`).join("\n\n");
  return { turns, readable };
}
