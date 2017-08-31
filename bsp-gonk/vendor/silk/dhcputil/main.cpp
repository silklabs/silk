/*
  Shell access to system/core/include/netutils/dhcp.h

  On success the program will put the string "OK\n" and the full command results
  are available via system properties.
  Any other output indicates a failure message.
*/

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <cutils/properties.h>
#ifdef TARGET_GE_NOUGAT
#include <netutils/ifc.h>

// http://androidxref.com/7.1.1_r6/xref/system/core/libnetutils/dhcpclient.c things:
extern "C" int do_dhcp(char*);
extern "C" void get_dhcp_info(
  uint32_t *ipaddr, uint32_t *gateway, uint32_t *prefixLength,
  uint32_t *dns1, uint32_t *dns2, uint32_t *server, uint32_t *lease
);

static const char *ipaddr_to_string(in_addr_t addr) {
  struct in_addr in_addr;
  in_addr.s_addr = addr;
  return inet_ntoa(in_addr);
}

#else
#include <netutils/dhcp.h>
#endif

int main(int argc, char **argv)
{
  if (argc != 3) {
    printf("Usage: %s ifname "
      "[dhcp_request|dhcp_stop]\n", argv[0]);
    exit(1);
  }
  char *ifname = argv[1];
  const char *cmd = argv[2];

  if (!strcmp(cmd, "dhcp_stop")) {
#ifdef TARGET_GE_NOUGAT
    printf("dhcp_stop not available");
    return 0;
#else
    dhcp_stop(ifname);
    // TODO: Check the value of |getprop init.svc.dhcpd_wlan0| for result
#endif

  } else if (!strcmp(cmd, "dhcp_request")) {
#ifdef TARGET_GE_NOUGAT
    int err;
    err = ifc_init();
    if (err != 0) {
      printf("ifc_init() failed\n");
      return 1;
    }

    err = do_dhcp(ifname);
    // Fill out the same system properties that older gonks set automatically
    // when dhcp completes.
    //
    // Eventually it would be good to get away from using system properties to
    // convey this information...
    //
    if (!err) {
      uint32_t ipaddr;
      uint32_t gateway;
      uint32_t prefixLength;
      uint32_t dns1;
      uint32_t dns2;
      uint32_t server;
      uint32_t leasetime;
      get_dhcp_info(
        &ipaddr,
        &gateway,
        &prefixLength,
        &dns1,
        &dns2,
        &server,
        &leasetime
      );

      char prop_name[PROPERTY_KEY_MAX];
      char prop_value[PROPERTY_VALUE_MAX];

      snprintf(prop_name, sizeof(prop_name), "dhcp.%s.ipaddress", ifname);
      property_set(prop_name, ipaddr_to_string(ipaddr));

      snprintf(prop_name, sizeof(prop_name), "dhcp.%s.mask", ifname);
      snprintf(prop_value, sizeof(prop_value), "%d", prefixLength);
      property_set(prop_name, prop_value);

      snprintf(prop_name, sizeof(prop_name), "dhcp.%s.gateway", ifname);
      property_set(prop_name, ipaddr_to_string(gateway));

      snprintf(prop_name, sizeof(prop_name), "dhcp.%s.dns1", ifname);
      property_set(prop_name, dns1 ? ipaddr_to_string(dns1) : "");

      snprintf(prop_name, sizeof(prop_name), "dhcp.%s.dns2", ifname);
      property_set(prop_name, dns2 ? ipaddr_to_string(dns2) : "");

      snprintf(prop_name, sizeof(prop_name), "dhcp.%s.leasetime", ifname);
      snprintf(prop_value, sizeof(prop_value), "%d", leasetime);
      property_set(prop_name, prop_value);
    }

    ifc_close();
#elif defined(TARGET_GE_MARSHMALLOW)
    int err = dhcp_start(ifname);
#else
    char ignored[PROPERTY_VALUE_MAX];
    uint32_t ignoredUInt32;
    char *ignoredArray[1] = { NULL };

    int err = dhcp_do_request(ifname,
      ignored, ignored, &ignoredUInt32, ignoredArray, ignored,
      &ignoredUInt32, ignored, ignored, ignored);
#endif
    if (err != 0) {
#ifndef TARGET_GE_NOUGAT
      printf("%s\n", dhcp_get_errmsg());
#endif
      return 1;
    }
    // Check the value of |getprop dhcp.wlan0.*| for results
    // Reference: http://androidxref.com/5.1.0_r1/xref/system/core/libnetutils/dhcp_utils.c#87
  }
  printf("OK\n");
  return 0;
}
