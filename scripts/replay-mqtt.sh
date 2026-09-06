#!/usr/bin/env bash
set -euo pipefail

host="${MQTT_HOST:-127.0.0.1}"
port="${MQTT_PORT:-1883}"

if [[ $# -lt 1 || $# -gt 3 ]]; then
  cat >&2 <<'USAGE'
Usage: replay-mqtt.sh <recording.tsv> [host] [port]

Replays a recording written by the mqtt-recorder compose service: publishes every line
to its original topic with the original QoS and retain flag, as fast as the broker accepts.
Timestamps are ignored. Messages on cmd/# are never replayed because the firmware would
execute them.

Environment:
  MQTT_HOST  Broker host. Default: 127.0.0.1
  MQTT_PORT  Broker port. Default: 1883
USAGE
  exit 1
fi

recording="$1"
if [[ $# -ge 2 ]]; then
  host="$2"
fi
if [[ $# -eq 3 ]]; then
  port="$3"
fi

if [[ ! -f "${recording}" ]]; then
  echo "Recording not found: ${recording}" >&2
  exit 1
fi

for tool in mosquitto_pub xxd; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} is required to replay a recording." >&2
    exit 1
  fi
done

sent=0
skipped=0
while IFS=$'\t' read -r _timestamp topic qos retain hex; do
  if [[ "${topic}" == cmd/* ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  publish_args=(-h "${host}" -p "${port}" -t "${topic}" -q "${qos}")
  if [[ "${retain}" == "1" ]]; then
    publish_args+=(-r)
  fi

  if [[ -z "${hex}" ]]; then
    mosquitto_pub "${publish_args[@]}" -n
  else
    printf '%s' "${hex}" | xxd -r -p | mosquitto_pub "${publish_args[@]}" -s
  fi
  sent=$((sent + 1))
done <"${recording}"

echo "Replayed ${sent} messages, skipped ${skipped} on cmd/#."
