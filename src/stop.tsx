import { showHUD } from "@raycast/api";
import { stopEverything } from "./lib/engine";

export default async function Command() {
  await stopEverything();
  await showHUD("RayVoice stopped");
}
