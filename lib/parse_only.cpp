/*
 * parse_only.cpp
 *
 * Home page of code is: https://www.smartmontools.org
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

#include "config.h"

#ifdef SMARTMON_PARSE_ONLY

#include <smartmon/ata.h>
#include <smartmon/atacmds.h>
#include <smartmon/dev_interface.h>
#include <smartmon/knowndrives.h>
#include <smartmon/parse_only.h>
#include <smartmon/utility.h>

#include "ataprint.h"
#include "dev_ata_cmd_set.h"
#include "smartctl.h"

#include <ctype.h>
#include <errno.h>
#include <new>
#include <stdlib.h>
#include <string.h>

using namespace smartmon;

// Required smartctl globals when SMARTMON_PARSE_ONLY is enabled.
json jglb;
bool printing_is_switchable = false;
bool printing_is_off = true;
bool failuretest_conservative = false;

void failuretest(failure_type /*type*/, int /*returnvalue*/)
{
}

void pout(const char * /*fmt*/, ...)
{
}

void jout(const char * /*fmt*/, ...)
{
}

void jinf(const char * /*fmt*/, ...)
{
}

void jwrn(const char * /*fmt*/, ...)
{
}

void jerr(const char * /*fmt*/, ...)
{
}

void jout_startup_datetime(const char * /*prefix*/)
{
}

namespace {

class parse_only_interface : public smart_interface
{
protected:
  ata_device * get_ata_device(const char * /*name*/, const char * /*type*/) override
    { return nullptr; }
  scsi_device * get_scsi_device(const char * /*name*/, const char * /*type*/) override
    { return nullptr; }
  smart_device * autodetect_smart_device(const char * /*name*/) override
    { return nullptr; }
};

class parse_only_ata_device final : public ata_device_with_command_set
{
public:
  parse_only_ata_device(smart_interface * intf,
                        const uint8_t id_raw[512],
                        const uint8_t smart_raw[512])
  : smart_device(intf, "parse-only", "ata", ""),
    m_is_open(false)
  {
    memcpy(m_id_raw, id_raw, sizeof(m_id_raw));
    memcpy(m_smart_raw, smart_raw, sizeof(m_smart_raw));
  }

  bool is_open() const override { return m_is_open; }
  bool open() override { m_is_open = true; return true; }
  bool close() override { m_is_open = false; return true; }
  bool ata_identify_is_cached() const override { return false; }

protected:
  int ata_command_interface(smart_command_set command, int /*select*/, char * data) override
  {
    switch (command) {
      case IDENTIFY:
      case PIDENTIFY:
        memcpy(data, m_id_raw, 512);
        return 0;
      case READ_VALUES:
        memcpy(data, m_smart_raw, 512);
        return 0;
      case READ_THRESHOLDS:
        memset(data, 0, 512);
        return 0;
      case CHECK_POWER_MODE:
        data[0] = (char)0xff;
        return 0;
      default:
        errno = ENOSYS;
        return -1;
    }
  }

private:
  bool m_is_open;
  uint8_t m_id_raw[512];
  uint8_t m_smart_raw[512];
};

static void write_ata_id_string(uint8_t * dst, size_t len, const char * src)
{
  char tmp[64];
  size_t copy_len = strlen(src);
  if (copy_len > len)
    copy_len = len;
  memset(tmp, ' ', len);
  memcpy(tmp, src, copy_len);
  for (size_t i = 0; i + 1 < len; i += 2) {
    dst[i] = (uint8_t)tmp[i + 1];
    dst[i + 1] = (uint8_t)tmp[i];
  }
}

static void build_identify_raw(uint8_t raw[512],
                               const char * sn,
                               const char * md,
                               const char * fw)
{
  ata_identify_device id;
  memset(&id, 0, sizeof(id));

  write_ata_id_string(id.serial_no, sizeof(id.serial_no), sn);
  write_ata_id_string(id.model, sizeof(id.model), md);
  write_ata_id_string(id.fw_rev, sizeof(id.fw_rev), fw);

  // SMART supported/enabled.
  id.command_set_1 = 0x0001;
  id.command_set_2 = 0x4000;
  id.cfs_enable_1 = 0x0001;
  id.csf_default = 0x4000;

  // Nominal rotation rate: 1 = SSD.
  id.words088_255[217 - 88] = 0x0001;

  memcpy(raw, &id, sizeof(id));
}

static bool hex_to_bytes(const char * hex, uint8_t out[512], std::string & err)
{
  size_t out_index = 0;
  int half = -1;
  for (const char * p = hex; *p; p++) {
    if (isspace((unsigned char)*p))
      continue;
    int v;
    if ('0' <= *p && *p <= '9')
      v = *p - '0';
    else if ('a' <= *p && *p <= 'f')
      v = *p - 'a' + 10;
    else if ('A' <= *p && *p <= 'F')
      v = *p - 'A' + 10;
    else {
      err = "invalid hex character";
      return false;
    }

    if (half < 0)
      half = v;
    else {
      if (out_index >= 512) {
        err = "hex input is longer than 512 bytes";
        return false;
      }
      out[out_index++] = (uint8_t)((half << 4) | v);
      half = -1;
    }
  }
  if (half >= 0) {
    err = "hex input has odd length";
    return false;
  }
  if (out_index != 512) {
    err = "hex input is not 512 bytes";
    return false;
  }
  return true;
}

static const char * json_error(const char * msg)
{
  smartmon::json::output_options opts;
  jglb.~json();
  new (&jglb) smartmon::json();
  jglb.enable(true);
  jglb["error"] = msg;
  std::string out = jglb.to_string(opts);
  char * ret = (char *)malloc(out.size() + 1);
  if (!ret)
    return nullptr;
  memcpy(ret, out.c_str(), out.size() + 1);
  return ret;
}

} // namespace

const char * smartmon_parse_ata_smart_json(const char * sn,
                                           const char * md,
                                           const char * fw,
                                           const char * rd_hex)
{
  if (!sn || !md || !fw || !rd_hex)
    return json_error("missing input");

  uint8_t smart_raw[512];
  std::string err;
  if (!hex_to_bytes(rd_hex, smart_raw, err))
    return json_error(err.c_str());

  uint8_t id_raw[512];
  build_identify_raw(id_raw, sn, md, fw);

  static bool db_inited = false;
  if (!db_inited) {
    init_drive_database(true);
    db_inited = true;
  }

  parse_only_interface intf;
  parse_only_ata_device dev(&intf, id_raw, smart_raw);
  dev.open();

  ata_print_options opts;
  opts.smart_vendor_attrib = true;
  opts.smart_general_values = false;
  opts.smart_check_status = false;
  opts.ignore_presets = false;

  jglb.~json();
  new (&jglb) smartmon::json();
  jglb.enable(true);
  jglb["input"]["sn"] = sn;
  jglb["input"]["md"] = md;
  jglb["input"]["fw"] = fw;

  ataPrintMain(&dev, opts);

  smartmon::json::output_options out_opts;
  std::string out = jglb.to_string(out_opts);
  char * ret = (char *)malloc(out.size() + 1);
  if (!ret)
    return nullptr;
  memcpy(ret, out.c_str(), out.size() + 1);
  return ret;
}

void smartmon_parse_only_free(const void * p)
{
  free(const_cast<void *>(p));
}

#endif // SMARTMON_PARSE_ONLY
