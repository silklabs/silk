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
#include <json/json.h>

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
      Json::Value jsonMsg; \
      jsonMsg["eventName"] = "error"; \
      mSensorsListener->sendEvent(jsonMsg); \
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
      mDevice(NULL),
      mSensorsList(NULL),
      mSensorListCount(0) {
  }

  virtual ~SensorsCommand() {}
  int runCommand(SocketClient *c, int argc, char ** argv);

private:
  int sensors_init();
  int sensors_activate(int sensorType, int activate, int rate);
  int sensors_poll();

  SensorsListener* mSensorsListener;
  struct sensors_poll_device_t* mDevice;
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
  void sendEvent(const Json::Value & jsonMsg) {
    Json::FastWriter fastWriter;
    std::string jsonMessage = fastWriter.write(jsonMsg);

    ALOGV("Broadcasting %s", jsonMessage.c_str());
    FrameworkListener::sendBroadcast(200, jsonMessage.c_str(), false);
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

  if (mDevice == NULL) {
    struct sensors_module_t *mModule = NULL;
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
            "\tpower: %f mA\n",
          mSensorsList[i].name, mSensorsList[i].vendor,
          mSensorsList[i].version, mSensorsList[i].handle,
          mSensorsList[i].type, mSensorsList[i].maxRange,
          mSensorsList[i].resolution, mSensorsList[i].power);
    }
  }

  // Deactivate all the sensors
  for (int i = 0; i < mSensorListCount; i++) {
    int err = mDevice->activate(mDevice, mSensorsList[i].handle, 0);
    if (err != 0) {
      ALOGE("deactivate(%s) failed: %d", mSensorsList[i].name, err);
    }
  }

  Json::Value jsonMsg;
  jsonMsg["eventName"] = "initialized";
  mSensorsListener->sendEvent(jsonMsg);
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
  Json::Value jsonMsg;
  if (activate) {
    err = mDevice->activate(mDevice, mSensorsList[count].handle, 1);
    LOG_ERROR((err != 0), "Failed to activate the sensor");
    mDevice->setDelay(mDevice, mSensorsList[count].handle, ms2ns(rate));

    jsonMsg["eventName"] = "activated";
    mSensorsListener->sendEvent(jsonMsg);
  } else  {
    err = mDevice->activate(mDevice, mSensorsList[count].handle, 0);
    LOG_ERROR((err != 0), "Failed to deactivate the sensor");

    Json::Value jsonMsg;
    jsonMsg["eventName"] = "deactivated";
    mSensorsListener->sendEvent(jsonMsg);
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

  // Format JSON message
  Json::Value jsonMsg;
  Json::Value jsonArray;
  jsonMsg["eventName"] = "data";
  jsonMsg["sensorType"] = data.type;

  switch (data.type) {
    case SENSOR_TYPE_LIGHT:
    case SENSOR_TYPE_PRESSURE:
    case SENSOR_TYPE_TEMPERATURE:
    case SENSOR_TYPE_PROXIMITY:
    case SENSOR_TYPE_RELATIVE_HUMIDITY:
    case SENSOR_TYPE_AMBIENT_TEMPERATURE:
      jsonArray.append(data.data[0]);
      break;
    case SENSOR_TYPE_ACCELEROMETER:
    case SENSOR_TYPE_MAGNETIC_FIELD:
    case SENSOR_TYPE_ORIENTATION:
    case SENSOR_TYPE_GYROSCOPE:
    case SENSOR_TYPE_GRAVITY:
    case SENSOR_TYPE_LINEAR_ACCELERATION:
    case SENSOR_TYPE_ROTATION_VECTOR:
    default:
      jsonArray.append(data.data[0]);
      jsonArray.append(data.data[1]);
      jsonArray.append(data.data[2]);
      break;
  }

  jsonMsg["values"] = jsonArray;
  mSensorsListener->sendEvent(jsonMsg);
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

    Json::Value jsonMsg; \
    jsonMsg["eventName"] = "error"; \
    sensorsListener.sendEvent(jsonMsg); \
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
