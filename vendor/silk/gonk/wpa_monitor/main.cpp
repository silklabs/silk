/*
  This program initializes wifi and the wpa_supplicant, then reports all
  wpa_supplicant events to stdout in the following format:

  * wpa_supplicant events: "([0-9A-Z][0-9A-Z])>(.*)\n" where
      - $1 is the length of the supplicant event
      - $2 is the supplicant event
  * Fatal errors: "!!>(.*)\n", where $1 is the error message

*/

#define LOG_TAG "wpa_monitor"

#include <stdlib.h>
#include <pthread.h>
#include <unistd.h>
#include <sys/prctl.h>

#include <cutils/properties.h>
#include <hardware_legacy/wifi.h>
#include <utils/Log.h>

#define BAIL_ON_FAIL(expression) \
  { \
    int err = expression; \
    if (err < 0) { \
      ALOGE(#expression " failed: %d\n", err); \
      printf("!!>" #expression " failed: %d\n", err); \
      exit(1); \
    } \
  } \


int pipefd[2];
bool exit_signal = false;

static void signal_handler(int signal)
{
  ALOGW("Exit signal");

  // Hint the event_loop() thread that it can exit if it wants/can
  exit_signal = true;

  // Unblock the main thread so it can exit
  int c = 0;
  write(pipefd[1], &c, 1);
}

static void unload_wifi(void)
{
  if (is_wifi_driver_loaded()) {
    ALOGW("Stopping wifi");
    int err = wifi_stop_supplicant(false);
    if (err != 0) {
      ALOGE("ERROR wifi_stop_supplicant() failed: %d\n", err);
    }
    err = wifi_unload_driver();
    if (err != 0) {
      ALOGE("wifi_load_driver() failed: %d\n", err);
    }
  }
}

void *event_loop(void *)
{
  while (!exit_signal) {
    char event[255];
    BAIL_ON_FAIL(wifi_wait_for_event(event, sizeof(event)-1));
    printf("%02x>%s\n", strlen(event), event);
  }
  return NULL;
}

int main(int, char **)
{
  setbuf(stdin, NULL);
  setbuf(stdout, NULL);

  signal(SIGTERM, signal_handler);
  signal(SIGHUP, signal_handler);
  signal(SIGPIPE, signal_handler);
  prctl(PR_SET_PDEATHSIG, SIGKILL);

  unload_wifi();
  BAIL_ON_FAIL(wifi_load_driver());
  BAIL_ON_FAIL(wifi_start_supplicant(false));
  BAIL_ON_FAIL(wifi_connect_to_supplicant());

  BAIL_ON_FAIL(pipe(pipefd));

  printf("02>OK\n");

  pthread_t thread;
  pthread_attr_t attr;

  pthread_attr_init(&attr);
  pthread_create(&thread, &attr, event_loop, NULL);

  int c;
  TEMP_FAILURE_RETRY(read(pipefd[0], &c, 1));

  wifi_close_supplicant_connection();
  unload_wifi();
  ALOGW("Exit");
  printf("!!>Normal exit\n");
  return 0;
}
