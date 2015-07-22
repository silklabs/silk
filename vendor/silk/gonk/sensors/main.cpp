/**
 * Sensors module
 *
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-sensors"
#include <utils/Log.h>

#include <stdlib.h>
#include <sysutils/FrameworkListener.h>
#include <utils/Timers.h>
#include <hardware/sensors.h>

using namespace android;

//
// Constants
//
#define SENSORS_SOCKET_NAME "sensors"
#define SENSORS_COMMAND_NAME "SensorsCommand"
#define MAX_MSG_SIZE 128

//
// Helper macros
//
#define LOG_ERROR(expression, ...) \
  do { \
    if (expression) { \
      ALOGE(__VA_ARGS__); \
      mSensorsListener->sendEvent("error"); \
      return 1; \
    } \
  } while(0)

//
// Forward declarations
//
class SensorsListener;

/**
 * This class provided a method that is run each time
 * {@code SENSORS_COMMAND_NAME} is received from node over the socket
 */
class SensorsCommand: public FrameworkCommand {
public:
  SensorsCommand(SensorsListener* sensorsListener) :
      FrameworkCommand(SENSORS_COMMAND_NAME),
      mSensorsListener(sensorsListener),
      mDevice(nullptr),
      mModule(nullptr),
      mSensorsList(nullptr),
      mSensorListCount(0) {
  }

  virtual ~SensorsCommand() {}
  int runCommand(SocketClient *c, int argc, char ** argv);

private:
  int sensors_init();
  int sensors_cleanup();
  int sensors_activate(int sensorType, int activate, int rate);
  int sensors_poll();

  SensorsListener* mSensorsListener;
  struct sensors_poll_device_t* mDevice;
  struct sensors_module_t* mModule;
  struct sensor_t const* mSensorsList;
  int mSensorListCount;
};

/**
 * This class provides a wrapper around sensors socket to help with
 * sending and receiving messages using the sensors socket.
 */
class SensorsListener: private FrameworkListener {
public:
  SensorsListener() :
      FrameworkListener(SENSORS_SOCKET_NAME) {
    FrameworkListener::registerCmd(new SensorsCommand(this));
  }

  int start() {
    ALOGD("Starting SensorsListener");
    return FrameworkListener::startListener();
  }

  /**
   * Notify the client of a sensors event
   */
  void sendEvent(const char *fmt, ...) {
    char* event;

    va_list argptr;
    va_start(argptr, fmt);
    vasprintf(&event, fmt, argptr);
    va_end(argptr);

    ALOGV("Broadcasting %s", event);
    FrameworkListener::sendBroadcast(200, event, false);
    free(event);
  }
};

/**
 * This function is run when a sensors command is received from the client
 */
int SensorsCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  char *saveptr;

  char *cmd = strtok_r(argv[1], " \n", &saveptr);
  if (!cmd) {
    return 1;
  }

  ALOGD("Received command %s", cmd);
  if (0 == strcmp(argv[1], "ready")) {
    sensors_init();
  } else if (0 == strcmp(cmd, "activate")) {
    char *sensorTypeStr = strtok_r(NULL, " \n", &saveptr);
    char *rateStr = strtok_r(NULL, " \n", &saveptr);
    if (sensorTypeStr && rateStr) {
      sensors_activate(atoi(sensorTypeStr), 1, atoi(rateStr));
    }
  } else if (0 == strcmp(cmd, "deactivate")) {
    char *sensorTypeStr = strtok_r(NULL, " \n", &saveptr);
    if (sensorTypeStr) {
      sensors_activate(atoi(sensorTypeStr), 0, -1);
    }
  } else if (0 == strcmp(cmd, "poll")) {
    sensors_poll();
  } else {
    LOG_ERROR(true, "Invalid command %s", argv[1]);
  }
  return 0;
}

/**
 * Initialize sensors HAL
 */
int SensorsCommand::sensors_init() {
  // Cleanup sensors if initialized already
  sensors_cleanup();

  int err = hw_get_module(SENSORS_HARDWARE_MODULE_ID,
      (hw_module_t const**) &mModule);
  LOG_ERROR((err < 0), "hw_get_module() failed (%s)", strerror(-err));

  err = sensors_open(&mModule->common, &mDevice);
  LOG_ERROR((err != 0), "sensors_open() failed (%s)", strerror(-err));

  mSensorListCount = mModule->get_sensors_list(mModule, &mSensorsList);
  ALOGD("%d sensors found:\n", mSensorListCount);
  for (int i = 0; i < mSensorListCount; i++) {
    ALOGV("%s\n"
        "\tvendor: %s\n"
        "\tversion: %d\n"
        "\thandle: %d\n"
        "\ttype: %d\n"
        "\tmaxRange: %f\n"
        "\tresolution: %f\n"
        "\tpower: %f mA\n", mSensorsList[i].name, mSensorsList[i].vendor, mSensorsList[i].version,
        mSensorsList[i].handle, mSensorsList[i].type, mSensorsList[i].maxRange, mSensorsList[i].resolution,
        mSensorsList[i].power);
  }

  mSensorsListener->sendEvent("initialized");
  return 0;
}

/**
 * Clean up sensors HAL
 */
int SensorsCommand::sensors_cleanup() {
  ALOGV("sensors cleanup");
  int err = 0;

  if (!mModule || !mDevice) {
    return 0;
  }

  // Deactivate all the sensors
  for (int i = 0; i < mSensorListCount; i++) {
    err = mDevice->activate(mDevice, mSensorsList[i].handle, 0);
    if (err != 0) {
      ALOGE("deactivate() for '%s'failed (%s)", mSensorsList[i].name,
          strerror(-err));
      return 1;
    }
  }

  // Close sensors module
  err = sensors_close(mDevice);
  if (err != 0) {
    ALOGE("sensors_close() failed (%s)", strerror(-err));
    return 1;
  }
  mDevice = nullptr;

  // Close hardware module
  free(mModule);
  mModule = nullptr;
  mSensorsList = nullptr;

  return 0;
}

/**
 * Activate/deactivate a given sensor
 *
 * @param sensorType - Type of the sensor to activate/deactivate
 * @param activate - 1 to activate and 0 to deactivate the sensor
 * @param rate - sampling rate in microseconds
 */
int SensorsCommand::sensors_activate(int sensorType, int activate, int rate) {
  // Get sensor device handle given the sensor type
  int count;
  for (count = 0; count < mSensorListCount; count++) {
    if (mSensorsList[count].type == sensorType) {
      break;
    }
  }
  LOG_ERROR((count >= mSensorListCount), "No such h/w sensor available %d",
      sensorType);

  int err;
  if (activate) {
    err = mDevice->activate(mDevice, mSensorsList[count].handle, 1);
    LOG_ERROR((err != 0), "Failed to activate the sensor");
    mDevice->setDelay(mDevice, mSensorsList[count].handle, ms2ns(rate));
    mSensorsListener->sendEvent("activated");
  } else  {
    err = mDevice->activate(mDevice, mSensorsList[count].handle, 0);
    LOG_ERROR((err != 0), "Failed to deactivate the sensor");
    mSensorsListener->sendEvent("deactivate");
  }
  return 0;
}

/**
 * Read sensor data
 */
int SensorsCommand::sensors_poll() {
  static const size_t numEvents = 1;
  sensors_event_t buffer[numEvents];

  int err = 0;
  int n = mDevice->poll(mDevice, buffer, numEvents);
  LOG_ERROR((n < 0), "poll() failed (%s)\n", strerror(-err));

  const sensors_event_t& data = buffer[0];
  LOG_ERROR((data.version != sizeof(sensors_event_t)),
      "incorrect event version (version=%d, expected=%d", data.version,
      sizeof(sensors_event_t));

  switch (data.type) {
    case SENSOR_TYPE_ACCELEROMETER:
    case SENSOR_TYPE_MAGNETIC_FIELD:
    case SENSOR_TYPE_ORIENTATION:
    case SENSOR_TYPE_GYROSCOPE:
    case SENSOR_TYPE_GRAVITY:
    case SENSOR_TYPE_LINEAR_ACCELERATION:
    case SENSOR_TYPE_ROTATION_VECTOR:
      mSensorsListener->sendEvent("data %d %5.1f %5.1f %5.1f",
          data.type, data.data[0], data.data[1], data.data[2]);
      break;
    case SENSOR_TYPE_LIGHT:
    case SENSOR_TYPE_PRESSURE:
    case SENSOR_TYPE_TEMPERATURE:
    case SENSOR_TYPE_PROXIMITY:
    case SENSOR_TYPE_RELATIVE_HUMIDITY:
    case SENSOR_TYPE_AMBIENT_TEMPERATURE:
      mSensorsListener->sendEvent("data %d %f", data.type,
          data.data[0]);
      break;
    default:
      mSensorsListener->sendEvent("data %d %f %f %f",
          data.type, data.data[0], data.data[1], data.data[2]);
      break;
  }
  return 0;
}

/**
 * Entry point into the sensors service
 */
int main(int argc, char *argv[]) {
  (void) argc;
  (void) argv;

  // Start the server socket and register for commands from sensors node module
  SensorsListener sensorsListener;
  int err = sensorsListener.start();
  if (err < 0) {
    ALOGE("Failed to start sensors socket listener: %d\n", err);
    sensorsListener.sendEvent("error");
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
