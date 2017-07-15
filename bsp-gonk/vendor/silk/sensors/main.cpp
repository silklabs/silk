//#define LOG_NDEBUG 0
#define LOG_TAG "silk-sensors"
#include <log/log.h>

#include <stdlib.h>
#include <utils/Timers.h>
#include <hardware/sensors.h>
#include <json/json.h>
#include <utils/Thread.h>
#include <utils/KeyedVector.h>

#include "FrameworkListener1.h"

using namespace android;
using namespace Json;
using namespace std;

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
      Value jsonMsg; \
      jsonMsg["eventName"] = "error"; \
      mSensorsListener->sendEvent(jsonMsg); \
      return 1; \
    } \
  } while(0)

//
// Forward declarations
//
class SensorsListener;
class SensorsPoll;

const char *apiNumToStr(int version) {
  switch(version) {
    case SENSORS_DEVICE_API_VERSION_0_1:
      return "SENSORS_DEVICE_API_VERSION_0_1";
    case SENSORS_DEVICE_API_VERSION_1_0:
      return "SENSORS_DEVICE_API_VERSION_1_0";
    case SENSORS_DEVICE_API_VERSION_1_1:
      return "SENSORS_DEVICE_API_VERSION_1_1";
    case SENSORS_DEVICE_API_VERSION_1_2:
      return "SENSORS_DEVICE_API_VERSION_1_2";
    case SENSORS_DEVICE_API_VERSION_1_3:
      return "SENSORS_DEVICE_API_VERSION_1_3";
    default:
      return "UNKNOWN";
  }
}

/**
 * This class provided a method that is run each time
 * {@code SENSORS_COMMAND_NAME} is received from node over the socket
 */
class SensorsCommand: public FrameworkCommand {
public:
  SensorsCommand(sp<SensorsListener> sensorsListener) :
      FrameworkCommand(SENSORS_COMMAND_NAME),
      mSensorsListener(sensorsListener),
      mDevice(NULL),
      mSensorsList(NULL),
      mSensorListCount(0),
      mSensorsPoll(NULL),
      mActiveSensorCount(0),
      mActiveSensors(false) {
  }

  virtual ~SensorsCommand() {}
  int runCommand(SocketClient *c, int argc, char ** argv);

private:
  int sensors_init();
  int sensors_activate(int sensorType, int activate, int rate);
  int sensors_poll();

  sp<SensorsListener> mSensorsListener;
  sensors_poll_device_1_t* mDevice;
  struct sensor_t const* mSensorsList;
  int mSensorListCount;
  sp<SensorsPoll> mSensorsPoll;
  int mActiveSensorCount;
  DefaultKeyedVector<int, bool> mActiveSensors;
  Reader mJsonReader;
};

/**
 * This class provides a wrapper around sensors socket to help with
 * sending and receiving messages using the sensors socket.
 */
class SensorsListener: private FrameworkListener1, public virtual RefBase {
public:
  SensorsListener() :
      FrameworkListener1(SENSORS_SOCKET_NAME) {
    FrameworkListener1::registerCmd(new SensorsCommand(this));
  }

  int start() {
    ALOGD("Starting SensorsListener");
    return FrameworkListener1::startListener();
  }

  /**
   * Notify the client of a sensors event
   */
  void sendEvent(const Value & jsonMsg) {
    FastWriter fastWriter;
    std::string jsonMessage = fastWriter.write(jsonMsg);

    ALOGV("Broadcasting %s", jsonMessage.c_str());
    FrameworkListener1::sendBroadcast(200, jsonMessage.c_str(), false);
  }
};

/**
 * This class implements a thread that keeps on polling for sensor values once
 * activated
 */
class SensorsPoll: public Thread {
public:
  SensorsPoll(sensors_poll_device_1_t* device,
      sp<SensorsListener> sensorsListener) :
      mDevice(device),
      mSensorsListener(sensorsListener) {
  }
  virtual bool threadLoop();

  /**
   * Start sensors poll thread
   */
  void start() {
    run();
  }

  /**
   * Stop sensors poll thread
   */
  void stop() {
    requestExitAndWait();
    ALOGV("Thread exited");
  }

private:
  sensors_poll_device_1_t* mDevice; // SensorsCommand is the owner of mDevice
  sp<SensorsListener> mSensorsListener;
};


/**************** Implementation of class SensorsCommand **********************/
/**
 * This function is run when a sensors command is received from the client
 */
int SensorsCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  ALOGD("Received command %s", argv[0]);

  // Parse JSON command
  Value cmdJson;
  bool result = mJsonReader.parse(argv[0], cmdJson, false);
  LOG_ERROR((result != true), "Failed to parse command: %s",
      mJsonReader.getFormattedErrorMessages().c_str());

  // Get command name
  Value cmdNameVal = cmdJson["cmdName"];
  LOG_ERROR((cmdNameVal.isNull()), "cmdName not available");

  string cmdName = cmdNameVal.asString();
  if (cmdName == "ready") {
    sensors_init();
  } else if (cmdName ==  "activate") {
    LOG_ERROR((cmdJson["sensorType"].isNull()), "sensor type not specified");
    LOG_ERROR((cmdJson["rate"].isNull()), "rate not specified");

    int sensorType = cmdJson["sensorType"].asInt();
    int rate = cmdJson["rate"].asInt();
    ALOGD("sensor Type %d rate %d", sensorType, rate);
    sensors_activate(sensorType, 1, rate);
  } else if (cmdName == "deactivate") {
    LOG_ERROR((cmdJson["sensorType"].isNull()), "sensor type not specified");

    int sensorType = cmdJson["sensorType"].asInt();
    sensors_activate(sensorType, 0, -1);
  } else if (cmdName == "poll") {
    if (mSensorsPoll != NULL) {
      ALOGW("sensors already polling");
      return 0;
    }
    mSensorsPoll = new SensorsPoll(mDevice, mSensorsListener);
    mSensorsPoll->start();
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

    err = sensors_open_1(&mModule->common, &mDevice);
    LOG_ERROR((err != 0), "sensors_open() failed (%s)", strerror(-err));
    ALOGD("HAL version:%s", apiNumToStr(mDevice->common.version));

    mSensorListCount = mModule->get_sensors_list(mModule, &mSensorsList);
    ALOGD("%d sensors found:", mSensorListCount);
    for (int i = 0; i < mSensorListCount; i++) {
      ALOGV("%s\n"
            "\tvendor: %s\n"
            "\tversion: %d\n"
            "\thandle: %d\n"
            "\ttype: %d\n"
            "\tmaxRange: %f\n"
            "\tresolution: %f\n"
            "\tpower: %f mA\n"
            "\tmax_delay: %dms\n"
            "\tfifoReservedEventCount: %u\n"
            "\tfifoMaxEventCount: %u\n",
          mSensorsList[i].name, mSensorsList[i].vendor,
          mSensorsList[i].version, mSensorsList[i].handle,
          mSensorsList[i].type, mSensorsList[i].maxRange,
          mSensorsList[i].resolution, mSensorsList[i].power,
          mSensorsList[i].maxDelay, mSensorsList[i].fifoReservedEventCount,
          mSensorsList[i].fifoMaxEventCount);
    }
  }

  // Deactivate all the sensors
  for (int i = 0; i < mSensorListCount; i++) {
    int err = mDevice->activate(
        reinterpret_cast<struct sensors_poll_device_t *>(mDevice),
        mSensorsList[i].handle, 0);
    if (err != 0) {
      ALOGE("deactivate(%s) failed: %d", mSensorsList[i].name, err);
    }
  }

  Value jsonMsg;
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
  Value jsonMsg;
  if (activate) {
    // Only activate if not already active
    if (!mActiveSensors.valueFor(mSensorsList[count].handle)) {
      err = mDevice->activate(
          reinterpret_cast<struct sensors_poll_device_t *>(mDevice),
          mSensorsList[count].handle, 1);
      LOG_ERROR((err != 0), "Failed to activate the sensor");

      if (mDevice->common.version >= SENSORS_DEVICE_API_VERSION_1_1) {
        mDevice->batch(mDevice, mSensorsList[count].handle, 0, ms2ns(rate),
            ms2ns(rate));
      } else {
        mDevice->setDelay(
            reinterpret_cast<struct sensors_poll_device_t *>(mDevice),
            mSensorsList[count].handle, ms2ns(rate));
      }
      mActiveSensorCount++;
      mActiveSensors.add(mSensorsList[count].handle, true);
    }
    jsonMsg["eventName"] = "activated";
    mSensorsListener->sendEvent(jsonMsg);
  } else  {
    if (mActiveSensors.valueFor(mSensorsList[count].handle)) {
      mActiveSensorCount--;
      mActiveSensors.removeItem(mSensorsList[count].handle);

      // If no more active sensors then stop polling
      if (mActiveSensorCount <= 0) {
        mSensorsPoll->stop();
        mSensorsPoll = NULL;
      }

      err = mDevice->activate(
          reinterpret_cast<struct sensors_poll_device_t *>(mDevice),
          mSensorsList[count].handle, 0);
      LOG_ERROR((err != 0), "Failed to deactivate the sensor");
    }

    jsonMsg["eventName"] = "deactivated";
    mSensorsListener->sendEvent(jsonMsg);
  }
  return 0;
}

/****************** Implementation of class SensorsPoll ***********************/
/**
 *  Sensors poll thread loop
 */
bool SensorsPoll::threadLoop() {
  static const size_t numEvents = 1;
  sensors_event_t buffer[numEvents];
  int err = 0;

  while(!exitPending()) {
    int n = mDevice->poll((struct sensors_poll_device_t *) mDevice, buffer,
        numEvents);
    LOG_ERROR((n < 0), "poll() failed (%s)\n", strerror(-err));

    const sensors_event_t& data = buffer[0];
    LOG_ERROR((data.version != sizeof(sensors_event_t)),
        "incorrect event version (version=%d, expected=%d", data.version,
        sizeof(sensors_event_t));

    // Format JSON message
    Value jsonMsg;
    Value jsonArray;
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

    Value jsonMsg; \
    jsonMsg["eventName"] = "error"; \
    sensorsListener.sendEvent(jsonMsg); \
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
