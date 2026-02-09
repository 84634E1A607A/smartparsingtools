/*
 * parse_only.h
 *
 * Home page of code is: https://www.smartmontools.org
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

#ifndef SMARTMON_PARSE_ONLY_H
#define SMARTMON_PARSE_ONLY_H

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define SMARTMON_PARSE_ONLY_API EMSCRIPTEN_KEEPALIVE
#else
#define SMARTMON_PARSE_ONLY_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

// Parse SMART values (512 bytes hex string) and return JSON output.
// The returned string must be freed with smartmon_parse_only_free().
SMARTMON_PARSE_ONLY_API const char * smartmon_parse_ata_smart_json(
  const char * sn, const char * md, const char * fw, const char * rd_hex);

SMARTMON_PARSE_ONLY_API void smartmon_parse_only_free(const void * p);

#ifdef __cplusplus
} // extern "C"
#endif

#endif // SMARTMON_PARSE_ONLY_H
