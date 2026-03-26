#!/usr/bin/env bash
set -euo pipefail

topic="${MQTT_TOPIC:-shared/firmware/test_stand_controller/elf}"
host="${MQTT_HOST:-127.0.0.1}"
port="${MQTT_PORT:-1883}"

if [[ $# -lt 1 || $# -gt 3 ]]; then
  cat >&2 <<'EOF'
Usage: publish-test-stand-elf.sh <elf-path> [host] [port]

Environment:
  MQTT_TOPIC     Retained topic to publish. Default: shared/firmware/test_stand_controller/elf
  MQTT_USERNAME  Optional MQTT username.
  MQTT_PASSWORD  Optional MQTT password.
EOF
  exit 1
fi

elf_path="$1"
if [[ $# -ge 2 ]]; then
  host="$2"
fi
if [[ $# -eq 3 ]]; then
  port="$3"
fi

if [[ ! -f "${elf_path}" ]]; then
  echo "ELF not found: ${elf_path}" >&2
  exit 1
fi

if ! command -v mosquitto_pub >/dev/null 2>&1; then
  echo "mosquitto_pub is required to publish the retained ELF topic." >&2
  exit 1
fi

publish_args=(
  -h "${host}"
  -p "${port}"
  -t "${topic}"
  -r
  -f "${elf_path}"
)

if [[ -n "${MQTT_USERNAME:-}" ]]; then
  publish_args+=(-u "${MQTT_USERNAME}")
fi

if [[ -n "${MQTT_PASSWORD:-}" ]]; then
  publish_args+=(-P "${MQTT_PASSWORD}")
fi

mosquitto_pub "${publish_args[@]}"
