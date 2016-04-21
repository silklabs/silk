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
#include <netutils/dhcp.h>

int main(int argc, char **argv)
{
  if (argc != 3) {
    printf("Usage: %s ifname "
      "[dhcp_request|dhcp_request_renew|dhcp_stop]\n", argv[0]);
    exit(1);
  }
  const char *ifname = argv[1];
  const char *cmd = argv[2];

  if (!strcmp(cmd, "dhcp_stop")) {
    dhcp_stop(ifname);
    // Check the value of |getprop init.svc.dhcpd_wlan0| for result

  } else if (!strcmp(cmd, "dhcp_request")) {
    char ignored[PROPERTY_VALUE_MAX];
    uint32_t ignoredUInt32;
    char *ignoredArray[1] = { NULL };

#ifdef TARGET_GE_MARSHMALLOW
    int err = dhcp_start(ifname);
#else
    int err = dhcp_do_request(ifname,
      ignored, ignored, &ignoredUInt32, ignoredArray, ignored,
      &ignoredUInt32, ignored, ignored, ignored);
#endif
    if (err != 0) {
      printf("%s\n", dhcp_get_errmsg());
      exit(1);
    }
    // Check the value of |getprop dhcp.wlan0.*| for results
    // Reference: http://androidxref.com/5.1.0_r1/xref/system/core/libnetutils/dhcp_utils.c#87

  } else if (!strcmp(cmd, "dhcp_request_renew")) {
    char ignored[PROPERTY_VALUE_MAX];
    uint32_t ignoredUInt32;
    char *ignoredArray[1] = { NULL };

#ifdef TARGET_GE_MARSHMALLOW
    int err = dhcp_start_renew(ifname);
#else
    int err = dhcp_do_request_renew(ifname,
      ignored, ignored, &ignoredUInt32, ignoredArray, ignored,
      &ignoredUInt32, ignored, ignored, ignored);
#endif
    if (err != 0) {
      printf("%s\n", dhcp_get_errmsg());
      exit(1);
    }
    // Check the value of |getprop dhcp.wlan0.*| for results
    // Reference: http://androidxref.com/5.1.0_r1/xref/system/core/libnetutils/dhcp_utils.c#87
  }
  printf("OK\n");
  return 0;
}
