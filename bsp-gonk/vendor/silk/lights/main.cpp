/*
  Shell access to hardware/libhardware/include/hardware/lights.h

  A return value of 0 indicates success. All other return values indicate
  failure.
*/

#define LOG_TAG "lights"
#define LOG_NDEBUG 0

#include <errno.h>
#include <inttypes.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <cutils/log.h>
#include <hardware/lights.h>

#define LOG_ERROR(_msg, ...)                                                   \
  do {                                                                         \
    ALOGE(_msg, __VA_ARGS__);                                                  \
    fprintf(stderr, "Error: " _msg "\n", __VA_ARGS__);                         \
  } while (0)

#define LOG_INFO(_msg, ...)                                                    \
  do {                                                                         \
    ALOGI(_msg, __VA_ARGS__);                                                  \
    fprintf(stdout, _msg "\n", __VA_ARGS__);                                            \
  } while (0)

void
printUsage(const char* binary)
{
  fprintf(stdout,
          "Usage: %s <light-id> <argb> [ <flash-mode> <flash-on-ms> "
          "<flash-off-ms> <brightness-mode> ]\n"
          "  <light-id> must be one of:\n"
          "    - " LIGHT_ID_BACKLIGHT "\n"
          "    - " LIGHT_ID_KEYBOARD "\n"
          "    - " LIGHT_ID_BUTTONS "\n"
          "    - " LIGHT_ID_BATTERY "\n"
          "    - " LIGHT_ID_NOTIFICATIONS "\n"
          "    - " LIGHT_ID_ATTENTION "\n"
          "    - " LIGHT_ID_BLUETOOTH "\n"
          "    - " LIGHT_ID_WIFI "\n"
          "  <argb> is a full color value of the form 0xaarrggbb passed in\n"
          "    decimal or hex form.\n"
          "  <flash-mode> [optional] must be one of:\n"
          "    - %d (LIGHT_FLASH_NONE) * default *\n"
          "    - %d (LIGHT_FLASH_TIMED)\n"
          "    - %d (LIGHT_FLASH_HARDWARE)\n"
          "  <flash-on-ms> [optional] is an integer passed in decimal or hex\n"
          "    form. Defaults to 0.\n"
          "  <flash-off-ms> [optional] is an integer passed in decimal or hex\n"
          "    form. Defaults to 0.\n"
          "  <brightness-mode> [optional] must be one of:\n"
          "    - %d (BRIGHTNESS_MODE_USER) * default *\n"
          "    - %d (BRIGHTNESS_MODE_SENSOR)\n",
          binary,
          LIGHT_FLASH_NONE,
          LIGHT_FLASH_TIMED,
          LIGHT_FLASH_HARDWARE,
          BRIGHTNESS_MODE_USER,
          BRIGHTNESS_MODE_SENSOR);
}

int
convertIntArg(char** argv,
              int argi,
              unsigned int max,
              unsigned int* converted)
{
  const char* start = argv[argi];
  if (*start == '\0') {
    LOG_ERROR("Argument %d is empty", argi);
    return 1;
  }

  errno = 0;

  char* end = NULL;
  long long value = strtoll(start, &end, 0);
  if (errno || *end != '\0') {
    LOG_ERROR("Argument %d ('%s') failed to convert", argi, start);
    return 1;
  }

  if (value < 0 || value > (long long) max) {
    LOG_ERROR("Argument %d ('%s') must be in the range [0, 0x%X]",
              argi,
              start,
              max);
    return 1;
  }

  *converted = (unsigned int) value;
  return 0;
}

int
main(int argc, char** argv)
{
  if (argc < 3 || argc > 7) {
    printUsage(argv[0]);
    return 1;
  }

  const char* light_id = argv[1];
  if (strcmp(light_id, LIGHT_ID_BACKLIGHT) &&
      strcmp(light_id, LIGHT_ID_KEYBOARD) &&
      strcmp(light_id, LIGHT_ID_BUTTONS) &&
      strcmp(light_id, LIGHT_ID_BATTERY) &&
      strcmp(light_id, LIGHT_ID_NOTIFICATIONS) &&
      strcmp(light_id, LIGHT_ID_ATTENTION) &&
      strcmp(light_id, LIGHT_ID_BLUETOOTH) &&
      strcmp(light_id, LIGHT_ID_WIFI)) {
    LOG_ERROR("'%s' is not a valid light id", light_id);
    return 1;
  }

  light_state_t light_state = {
    0 /* color */,
    LIGHT_FLASH_NONE /* flashMode */,
    0 /* flashOnMS */,
    0 /* flashOffMS */,
    BRIGHTNESS_MODE_USER /* brightnessMode */
#ifdef LIGHT_MODE_MULTIPLE_LEDS
    , 0 /* ledsModes */
#endif
  };

  int err;

  switch (argc) {
    case 7:
      err = convertIntArg(argv,
                          6,
                          BRIGHTNESS_MODE_SENSOR,
                          (unsigned int*) &light_state.brightnessMode);
      if (err) {
        return err;
      }
      /* fall through */
    case 6:
      err = convertIntArg(argv,
                          5,
                          0xFFFFFFFF,
                          (unsigned int*) &light_state.flashOffMS);
      if (err) {
        return err;
      }
      /* fall through */
    case 5:
      err = convertIntArg(argv,
                          4,
                          0xFFFFFFFF,
                          (unsigned int*) &light_state.flashOnMS);
      if (err) {
        return err;
      }
      /* fall through */
    case 4:
      err = convertIntArg(argv,
                          3,
                          LIGHT_FLASH_HARDWARE,
                          (unsigned int*) &light_state.flashMode);
      if (err) {
        return err;
      }
      /* fall through */
    case 3:
      err = convertIntArg(argv, 2, 0xFFFFFFFF, &light_state.color);
      if (err) {
        return err;
      }
      break;

    default:
      LOG_ERROR("Incorrect argument count: %d", argc);
      return 1;
  }

  const hw_module_t* hw_module;
  err = hw_get_module(LIGHTS_HARDWARE_MODULE_ID, &hw_module);
  if (err) {
    LOG_ERROR("Failed to open '" LIGHTS_HARDWARE_MODULE_ID "' module: %d", err);
    return 1;
  }

  hw_device_t* hw_device;
  err = hw_module->methods->open(hw_module, light_id, &hw_device);
  if (err) {
    LOG_ERROR("Failed to open '%s' device: %d", light_id, err);
    return 1;
  }

  light_device_t* light_device = (light_device_t *) hw_device;

  err = light_device->set_light(light_device, &light_state);
  if (err) {
    LOG_ERROR("Failed to set '%s': %d", light_id, err);
  } else {
    LOG_INFO("Set '%s': color = 0x%X, flashMode = %d, flashOnMS = %d, "
             "flashOffMS = %d, brightnessMode = %d",
             light_id,
             light_state.color,
             light_state.flashMode,
             light_state.flashOnMS,
             light_state.flashOffMS,
             light_state.brightnessMode);
  }

  int closeErr = hw_device->close(hw_device);
  if (closeErr) {
    LOG_ERROR("Failed to close '%s': %d", light_id, closeErr);
  }

  return err ? 1 : 0;
}
