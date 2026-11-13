#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/../.." && pwd)
decoder_dir="${repo_root}/esp32-mainboard/tools/defmt-mqtt-decoder"
out_dir="${repo_root}/frontend/public/defmt-mqtt-decoder"

if [[ ! -d "${decoder_dir}" ]]; then
  echo "Missing ${decoder_dir}. Initialize submodules first." >&2
  exit 1
fi

mkdir -p "${out_dir}"

cd "${decoder_dir}"
# esp32-mainboard/tools/.cargo/config.toml sets build.target to the host for the native
# tools, and wasm-pack builds for whatever build.target says. Point it back at WebAssembly.
RUSTFLAGS='' CARGO_BUILD_TARGET=wasm32-unknown-unknown \
  wasm-pack build --target web --out-dir "${out_dir}"
