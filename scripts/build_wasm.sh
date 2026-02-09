#!/usr/bin/env bash
set -euo pipefail

# Build a WASM module that exposes:
#   smartmon_parse_ata_smart_json(sn, md, fw, rd_hex)
#   smartmon_parse_only_free(ptr)
#
# Prereqs:
#   - Emscripten SDK installed and emcc available in PATH.
#   - Configure-generated headers in include/smartmon (run ./autogen.sh and ./configure).
#
# Usage:
#   ./build_wasm.sh
#   OUTPUT=dist ./build_wasm.sh
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUTPUT_DIR="${OUTPUT:-${ROOT_DIR}/workers/webui}"
EM_CACHE_DIR="${EM_CACHE:-}"

mkdir -p "${OUTPUT_DIR}"
if [[ -n "${EM_CACHE_DIR}" ]]; then
  mkdir -p "${EM_CACHE_DIR}"
fi

if [[ ! -x "${ROOT_DIR}/configure" ]]; then
  echo "configure not found; running ./autogen.sh"
  (cd "${ROOT_DIR}" && ./autogen.sh)
fi

if [[ ! -f "${ROOT_DIR}/config.h" ]]; then
  echo "config.h not found; running ./configure"
  (cd "${ROOT_DIR}" && ./configure)
fi

if [[ ! -f "${ROOT_DIR}/include/smartmon/smartmon_config.h" ]]; then
  echo "smartmon_config.h not found; running make -C include"
  (cd "${ROOT_DIR}" && make -C include)
fi

if [[ -n "${EM_CACHE_DIR}" ]]; then
  EM_CACHE="${EM_CACHE_DIR}" emcc -O2 -I"${ROOT_DIR}/include" -I"${ROOT_DIR}" -I"${ROOT_DIR}/src" -I"${ROOT_DIR}/drivedb" \
    -DSMARTMON_PARSE_ONLY \
    -DSMARTMONTOOLS_SYSCONFDIR=\"/usr/local/etc\" \
    -DSMARTMONTOOLS_DRIVEDBDIR=\"/usr/local/share/smartmontools\" \
    "${ROOT_DIR}/src/ataprint.cpp" \
    "${ROOT_DIR}/src/ataidentify.cpp" \
    "${ROOT_DIR}/src/farmprint.cpp" \
    "${ROOT_DIR}/lib/parse_only.cpp" \
    "${ROOT_DIR}/lib/atacmds.cpp" \
    "${ROOT_DIR}/lib/atacmdnames.cpp" \
    "${ROOT_DIR}/lib/knowndrives.cpp" \
    "${ROOT_DIR}/lib/json.cpp" \
    "${ROOT_DIR}/lib/utility.cpp" \
    "${ROOT_DIR}/lib/dev_ata_cmd_set.cpp" \
    "${ROOT_DIR}/lib/dev_interface.cpp" \
    "${ROOT_DIR}/lib/farmcmds.cpp" \
    "${ROOT_DIR}/lib/scsicmds.cpp" \
    "${ROOT_DIR}/lib/scsinvme.cpp" \
    "${ROOT_DIR}/lib/nvmecmds.cpp" \
    "${ROOT_DIR}/lib/scsiata.cpp" \
    "${ROOT_DIR}/lib/dev_intelliprop.cpp" \
    "${ROOT_DIR}/lib/dev_jmb39x_raid.cpp" \
    -s EXPORTED_FUNCTIONS="['_smartmon_parse_ata_smart_json','_smartmon_parse_only_free','_malloc','_free']" \
    -s EXPORTED_RUNTIME_METHODS="['cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']" \
    -s ENVIRONMENT=web -s MODULARIZE=1 -s EXPORT_ES6=1 \
    -o "${OUTPUT_DIR}/smartmon_parse.js"
else
  emcc -O2 -I"${ROOT_DIR}/include" -I"${ROOT_DIR}" -I"${ROOT_DIR}/src" -I"${ROOT_DIR}/drivedb" \
  -DSMARTMON_PARSE_ONLY \
  -DSMARTMONTOOLS_SYSCONFDIR=\"/usr/local/etc\" \
  -DSMARTMONTOOLS_DRIVEDBDIR=\"/usr/local/share/smartmontools\" \
  "${ROOT_DIR}/src/ataprint.cpp" \
  "${ROOT_DIR}/src/ataidentify.cpp" \
  "${ROOT_DIR}/src/farmprint.cpp" \
  "${ROOT_DIR}/lib/parse_only.cpp" \
  "${ROOT_DIR}/lib/atacmds.cpp" \
  "${ROOT_DIR}/lib/atacmdnames.cpp" \
  "${ROOT_DIR}/lib/knowndrives.cpp" \
  "${ROOT_DIR}/lib/json.cpp" \
  "${ROOT_DIR}/lib/utility.cpp" \
  "${ROOT_DIR}/lib/dev_ata_cmd_set.cpp" \
  "${ROOT_DIR}/lib/dev_interface.cpp" \
  "${ROOT_DIR}/lib/farmcmds.cpp" \
  "${ROOT_DIR}/lib/scsicmds.cpp" \
  "${ROOT_DIR}/lib/scsinvme.cpp" \
  "${ROOT_DIR}/lib/nvmecmds.cpp" \
  "${ROOT_DIR}/lib/scsiata.cpp" \
  "${ROOT_DIR}/lib/dev_intelliprop.cpp" \
  "${ROOT_DIR}/lib/dev_jmb39x_raid.cpp" \
  -s EXPORTED_FUNCTIONS="['_smartmon_parse_ata_smart_json','_smartmon_parse_only_free','_malloc','_free']" \
  -s EXPORTED_RUNTIME_METHODS="['cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']" \
  -s ENVIRONMENT=web -s MODULARIZE=1 -s EXPORT_ES6=1 \
  -o "${OUTPUT_DIR}/smartmon_parse.js"
fi

echo "WASM build complete:"
echo "  ${OUTPUT_DIR}/smartmon_parse.js"
echo "  ${OUTPUT_DIR}/smartmon_parse.wasm"
