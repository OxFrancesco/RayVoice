/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** ElevenLabs API Key - Get one at https://elevenlabs.io/app/settings/api-keys (free tier includes ~10 min/mo). */
  "apiKey": string,
  /** Voice ID (Host 1 / Narrator) - Voice ID from elevenlabs.io/app/voice-library. Default is Rachel. */
  "voiceId": string,
  /** Voice ID (Host 2, dialogue only) - Second voice for the 2-host podcast command. Default is George. */
  "voiceId2": string,
  /** ElevenLabs Model - eleven_v4 is the latest + most expressive (Sep 2026). Turbo is faster, Flash is cheapest. */
  "modelId": "eleven_v4" | "eleven_v4_turbo" | "eleven_v3" | "eleven_multilingual_v2" | "eleven_flash_v2_5",
  /** Audio Format - MP3 128kbps works everywhere. Lower bitrates save credits/bandwidth slightly. */
  "outputFormat": "mp3_44100_128" | "mp3_44100_64" | "mp3_22050_32",
  /** Playback - Auto-play the MP3 after generating it. */
  "autoPlay": boolean
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
}

declare namespace Arguments {
  /** Arguments passed to the `clipboard-speech` command */
  export type ClipboardSpeech = {}
  /** Arguments passed to the `clipboard-podcast` command */
  export type ClipboardPodcast = {}
  /** Arguments passed to the `intro` command */
  export type Intro = {}
}

