/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** ElevenLabs API Key - Create one at elevenlabs.io/app/settings/api-keys. */
  "apiKey": string,
  /** Voice ID (Host 1 / Narrator) - Any voice ID from elevenlabs.io/app/voice-library. Default is Rachel. */
  "voiceId": string,
  /** Voice ID (Host 2, dialogue only) - Second voice for the 2-host podcast. Default is George. */
  "voiceId2": string,
  /** ElevenLabs Model - Turbo starts fastest. Text-to-Dialogue uses Turbo when Flash or Multilingual is picked. */
  "modelId": "eleven_v4_turbo" | "eleven_v4" | "eleven_v3" | "eleven_multilingual_v2" | "eleven_flash_v2_5",
  /** Audio Format - 128 kbps sounds best. Lower bitrates make smaller files. */
  "outputFormat": "mp3_44100_128" | "mp3_44100_64" | "mp3_22050_32",
  /** Playback - Start playing as soon as the first part is ready. */
  "autoPlay": boolean,
  /** Playback Speed - Starting speed. Change it while listening with ⌘S. */
  "playbackRate": "1" | "1.25" | "1.5" | "1.75" | "2"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `clipboard-speech` command */
  export type ClipboardSpeech = ExtensionPreferences & {}
  /** Preferences accessible in the `clipboard-podcast` command */
  export type ClipboardPodcast = ExtensionPreferences & {}
  /** Preferences accessible in the `intro` command */
  export type Intro = ExtensionPreferences & {}
  /** Preferences accessible in the `history` command */
  export type History = ExtensionPreferences & {}
  /** Preferences accessible in the `stop` command */
  export type Stop = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `clipboard-speech` command */
  export type ClipboardSpeech = {}
  /** Arguments passed to the `clipboard-podcast` command */
  export type ClipboardPodcast = {}
  /** Arguments passed to the `intro` command */
  export type Intro = {}
  /** Arguments passed to the `history` command */
  export type History = {}
  /** Arguments passed to the `stop` command */
  export type Stop = {}
}

