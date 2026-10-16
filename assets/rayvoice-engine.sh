#!/bin/sh
# RayVoice engine. Raycast spawns it detached, so voicing and playback keep
# going after the command window closes.
#
#   fetch     <job>             voice every part, then join them into the episode file
#   fetch-one <job> <i>         voice part i (run by xargs, a few at a time)
#   play      <state> <file>... play files in order, waiting for each one to land
#
# A job dir holds: url, headers (API key, deleted when done), count, parallel,
# out, body-<i>.json, optional transcript.txt. The engine writes part-<i>.mp3,
# error (HTTP code on line 1, response body after), and done.

set -u

fetch_one() {
  job=$1
  i=$2
  [ -f "$job/error" ] && exit 255
  code=$(curl -sS --retry 5 --retry-max-time 180 \
    -H @"$job/headers" \
    -H "Content-Type: application/json" \
    -H "Accept: audio/mpeg" \
    --data-binary @"$job/body-$i.json" \
    -o "$job/part-$i.tmp" \
    -w '%{http_code}' \
    "$(cat "$job/url")" 2>"$job/curl-$i.log") || code=000
  if [ "$code" = 200 ]; then
    mv "$job/part-$i.tmp" "$job/part-$i.mp3"
    rm -f "$job/curl-$i.log"
    exit 0
  fi
  { echo "$code"; cat "$job/part-$i.tmp" "$job/curl-$i.log" 2>/dev/null; } >"$job/error.$i"
  mv -n "$job/error.$i" "$job/error"
  rm -f "$job/error.$i"
  # 255 tells xargs to stop starting new requests.
  exit 255
}

# Byte offset of the first audio frame. Each ElevenLabs MP3 opens with an ID3
# tag and an Info frame holding that file's frame count. Left in a joined
# file, the first part's Info frame makes players stop when that part ends.
audio_start() {
  f=$1
  # shellcheck disable=SC2046
  set -- $(od -An -tu1 -N10 "$f")
  off=0
  if [ "$1" = 73 ] && [ "$2" = 68 ] && [ "$3" = 51 ]; then
    off=$((10 + ($7 << 21) + ($8 << 14) + ($9 << 7) + ${10}))
  fi
  # shellcheck disable=SC2046
  set -- $(od -An -tu1 -j "$off" -N4 "$f")
  [ "${1:-0}" = 255 ] || { echo "$off"; return; }
  version=$((($2 >> 3) & 3))
  rate_idx=$((($3 >> 2) & 3))
  pad=$((($3 >> 1) & 1))
  if [ "$version" = 3 ]; then
    kbps=$(echo "0 32 40 48 56 64 80 96 112 128 160 192 224 256 320" | cut -d' ' -f$((($3 >> 4) + 1)))
    sr=$(echo "44100 48000 32000" | cut -d' ' -f$((rate_idx + 1)))
    len=$((144000 * kbps / sr + pad))
  else
    kbps=$(echo "0 8 16 24 32 40 48 56 64 80 96 112 128 144 160" | cut -d' ' -f$((($3 >> 4) + 1)))
    sr=$(echo "22050 24000 16000" | cut -d' ' -f$((rate_idx + 1)))
    [ "$version" = 0 ] && sr=$((sr / 2))
    len=$((72000 * kbps / sr + pad))
  fi
  if [ "$len" -gt 4 ] && dd if="$f" bs=1 skip="$off" count="$len" 2>/dev/null | grep -aq 'Info\|Xing'; then
    off=$((off + len))
  fi
  echo "$off"
}

fetch() {
  job=$1
  n=$(cat "$job/count")
  seq 1 "$n" | xargs -n 1 -P "$(cat "$job/parallel")" sh "$0" fetch-one "$job"
  rm -f "$job/headers"
  [ -f "$job/error" ] && exit 1

  i=1
  : >"$job/joined.mp3"
  while [ "$i" -le "$n" ]; do
    if [ "$n" = 1 ]; then
      cat "$job/part-1.mp3" >"$job/joined.mp3"
    else
      tail -c +$(($(audio_start "$job/part-$i.mp3") + 1)) "$job/part-$i.mp3" >>"$job/joined.mp3"
    fi
    i=$((i + 1))
  done
  out=$(cat "$job/out")
  mkdir -p "$(dirname "$out")"
  [ -f "$job/transcript.txt" ] && cp "$job/transcript.txt" "${out%.mp3}.txt"
  mv "$job/joined.mp3" "$out"
  touch "$job/done"
}

play() {
  state=$1
  shift
  child=""
  restart=0
  clear_now() {
    [ "$(cat "$state/pid" 2>/dev/null)" = "$$" ] && rm -f "$state/now" "$state/pid"
  }
  # USR1: the speed changed, restart the current file at the new rate.
  trap 'restart=1; [ -n "$child" ] && kill "$child" 2>/dev/null' USR1
  trap '[ -n "$child" ] && kill "$child" 2>/dev/null; clear_now; exit 0' TERM INT HUP

  for f in "$@"; do
    while [ ! -f "$f" ]; do
      [ -f "$(dirname "$f")/error" ] && { clear_now; exit 0; }
      sleep 0.1
    done
    restart=1
    while [ "$restart" = 1 ]; do
      restart=0
      rate=$(cat "$state/rate" 2>/dev/null || echo 1)
      printf '%s\n' "$f" >"$state/now"
      if [ "$rate" = 1 ]; then
        afplay "$f" &
      else
        afplay -r "$rate" -q 1 "$f" &
      fi
      child=$!
      wait "$child"
      while kill -0 "$child" 2>/dev/null; do wait "$child"; done
    done
  done
  clear_now
}

cmd=$1
shift
case "$cmd" in
  fetch) fetch "$@" ;;
  fetch-one) fetch_one "$@" ;;
  play) play "$@" ;;
  *) exit 2 ;;
esac
