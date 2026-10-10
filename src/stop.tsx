import { showHUD } from "@raycast/api";
import { stopAllAfplay } from "./lib/audio";

/** No-view command: instantly silence any RayVoice audio, from anywhere. */
export default async function Command() {
  await stopAllAfplay();
  await showHUD("⏹️ RayVoice stopped");
}
