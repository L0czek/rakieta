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
RUSTFLAGS='' wasm-pack build --target web --out-dir "${out_dir}"
