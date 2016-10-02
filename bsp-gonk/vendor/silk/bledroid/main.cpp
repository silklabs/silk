#define LOG_NDEBUG 0
#define LOG_TAG "bledroid"
// Uncomment to use systrace
//#define ATRACE_TAG ATRACE_TAG_ALWAYS
#include <utils/Log.h>
#include <cutils/properties.h>
#include <cutils/trace.h>

#include <fcntl.h>
#include <sys/prctl.h>
#include <sys/capability.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <hardware/bluetooth.h>
#include <hardware/bt_gatt.h>
#include <hardware/hardware.h>
#include <hardware_legacy/power.h>
#include <utils/Condition.h>
#include <utils/Mutex.h>
#include <utils/Timers.h>
#include <sysutils/FrameworkListener.h>
#include <limits.h>
#include <memory>
#include <cctype>
#include <private/android_filesystem_config.h>
#include <cutils/properties.h>

#define BLE_SOCKET_NAME "bledroid"
#define BLE_COMMAND_NAME "BleCommand"
#define MAX_MSG_SIZE 1024
#define MAX_NOTIFICATION_DATA_SIZE 20
#define MTU_SIZE 512

#define BT_UNITS_PER_MS 1000 / 625

// Error codes from system/bt/bta/include/bta_gatt_api.h:
//
// #define BTA_GATT_CONN_UNKNOWN               0
// #define BTA_GATT_CONN_L2C_FAILURE           GATT_CONN_L2C_FAILURE           /* general l2cap resource failure */
// #define BTA_GATT_CONN_TIMEOUT               GATT_CONN_TIMEOUT               /* 0x08 connection timeout  */
// #define BTA_GATT_CONN_TERMINATE_PEER_USER   GATT_CONN_TERMINATE_PEER_USER   /* 0x13 connection terminate by peer user  */
// #define BTA_GATT_CONN_TERMINATE_LOCAL_HOST  GATT_CONN_TERMINATE_LOCAL_HOST  /* 0x16 connectionterminated by local host  */
// #define BTA_GATT_CONN_FAIL_ESTABLISH        GATT_CONN_FAIL_ESTABLISH        /* 0x03E connection fail to establish  */
// #define BTA_GATT_CONN_LMP_TIMEOUT           GATT_CONN_LMP_TIMEOUT           /* 0x22 connection fail for LMP response tout */
// #define BTA_GATT_CONN_CANCEL                GATT_CONN_CANCEL                /* 0x0100 L2CAP connection cancelled  */
// #define BTA_GATT_CONN_NONE                  0x0101                          /* 0x0101 no connection to cancel  */

using namespace android;

enum WaitType {
  WaitNone = 0,
  WaitEnableDisable,
  WaitRegisterClient,
  WaitRegisterServer,
  WaitScanFilterEnable,
  WaitScanFilterParamSetup,
  WaitScanFilterConfig,
  WaitSearchService,
  WaitGetIncludedService,
  WaitGetCharacteristic,
  WaitGetDescriptor,
  WaitReadCharacteristic,
  WaitWriteCharacteristic,
  WaitRegisterForNotification,
  WaitReadDescriptor,
  WaitWriteDescriptor,
  WaitListen,
  WaitReadRemoteRssi,
  WaitAddService,
  WaitAddCharacteristic,
  WaitAddDescriptor,
  WaitStartService,
  WaitStopService,
  WaitDeleteService,
  WaitConnect,
  WaitDisconnect,
  WaitServerDisconnect,
  WaitNotify,
  WaitAdvertiseEnable,
  WaitAdvertiseData,
  WaitAdvertiseDisable,
  WaitMTUChange,
};

// These wait types won't abort if waiting fails.
static const WaitType kToleratedWaitFailures[] = {
  WaitReadRemoteRssi
};

enum {
  ScanDeliveryModeImmediate = 0,
  ScanDeliveryModeFoundLost = 1,
  ScanDeliveryModeBatch = 2
};

enum {
  ScanFeatureSelectionAllPass = 0
};

enum {
  ScanFilterActionAdd = 0,
  ScanFilterActionDelete = 1,
  ScanFilterActionClear = 2
};

enum {
  ScanFilterTypeAddress = 0,
  ScanFilterTypeServiceData = 1,
  ScanFilterTypeServiceUUID = 2,
  ScanFilterTypeSolicitUUID = 3,
  ScanFilterTypeLocalName = 4,
  ScanFilterTypeManufacturerData = 5
};

enum {
  ConnectTransportAuto = 0,
  ConnectTransportBREDR = 1,
  ConnectTransportLE = 2
};

enum {
  WriteTypeNoResponse = 1 << 0,
  WriteTypeDefault = 1 << 1,
  WriteTypeSigned = 1 << 2
};

enum {
  AdvertiseModeLowPower = BT_UNITS_PER_MS * 1000,
  AdvertiseModeBalanced = BT_UNITS_PER_MS * 250,
  AdvertiseModeLowLatency = BT_UNITS_PER_MS * 100,
  AdvertiseIntervalDeltaUnit = 10,
};

enum {
  AdvertiseEventTypeConnectable = 0,
  AdvertiseEventTypeScannable = 2,
  AdvertiseEventTypeNonConnectable = 3,
};

enum {
  TransactionPowerLevelMin = 0,
  TransactionPowerLevelLow = 1,
  TransactionPowerLevelMed = 2,
  TransactionPowerLevelHigh = 3,
  TransactionPowerLevelMax = 4,
};

enum {
  AdvertiseChannel37 = 1 << 0,
  AdvertiseChannel38 = 1 << 1,
  AdvertiseChannel39 = 1 << 2,
  AdvertiseChannelAll = AdvertiseChannel37 |
                        AdvertiseChannel38 |
                        AdvertiseChannel39,
};

//
// Constants
//

// This should be the same as GATT_MAX_PHY_CHANNEL in
// external/bluetooth/bluedroid/include/bt_target.h
static const size_t kMaxConnectionCount = 7;

static const nsecs_t kDefaultWaitTimeout = seconds_to_nanoseconds(15);

static const int kScanModeWindow = 5000 * BT_UNITS_PER_MS;
static const int kScanModeInterval = 5000 * BT_UNITS_PER_MS;
static const int kScanLostFoundTimeout = 0;
static const int kScanFoundSightings = 2;
static const int kScanFilterIndex = 1;

static const char kWakeLockId[] = "BledroidWakeLock";

static const bt_bdaddr_t kInvalidAddr = {{
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff
}};

static const bt_uuid_t kBluetoothBaseUuid = {{
  0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80,
  0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
}};

static const bt_uuid_t kInvalidUuid = {{
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff
}};

static const bt_uuid_t kServerUuid = {{
  0xe0, 0x38, 0x96, 0x1d, 0xe1, 0xe2, 0xd6, 0xa0,
  0xdf, 0x46, 0x99, 0xe1, 0x2e, 0x63, 0xd7, 0x5c
}};

static const bt_uuid_t kClientListenScanUuid = {{
  0xac, 0x2f, 0x97, 0x60, 0x54, 0xc0, 0xd5, 0xa8,
  0xe0, 0x42, 0x8f, 0x7d, 0x94, 0xd8, 0x5d, 0xed
}};

static const bt_uuid_t kClientBeaconUuid = {{
  0xbd, 0x4e, 0x5b, 0x43, 0x0e, 0xce, 0x4a, 0xcb,
  0x89, 0x09, 0x81, 0xce, 0x03, 0xcc, 0xd6, 0x2f
}};

class Tracer {
public:
  static void init() {
    atrace_set_tracing_enabled(true);
    ATRACE_INIT();
  }

  Tracer(const char *name) {
    ATRACE_BEGIN(name);
  }

  ~Tracer() {
    ATRACE_END();
  }
};

void bt_cleanup();
int bt_stop_advertising();
int bt_stop_beacon();

//
// Helper macros
//
#define CALL_AND_WAIT_HELPER(_expression, _waitType, _return) \
  do { \
    Tracer _trc("wait:" #_waitType); \
    auto _lock = mainThreadWaiter.autoLock(); \
    int _err = (_expression); \
    if (_err != BT_STATUS_SUCCESS) { \
      ALOGE("bt operation " #_expression " failed: %d", _err); \
      if (_return) { \
        return 1; \
      } \
    } \
    mainThreadWaiter.wait((_waitType)); \
  } while(0)

#define CALL_AND_WAIT(_expression, _waitType) \
  CALL_AND_WAIT_HELPER(_expression, _waitType, true)

#define CALL_AND_WAIT_NO_RETURN(_expression, _waitType) \
  CALL_AND_WAIT_HELPER(_expression, _waitType, false)

#define LOG_ERROR(expression, ...) \
  do { \
    if ((expression)) { \
      ALOGE(__VA_ARGS__); \
      return 1; \
    } \
  } while(0)

/**
 * This class provided a method that is run each time a {@code BLE_COMMAND_NAME}
 * is received from bleno over the socket
 */
class BleCommand: public FrameworkCommand {
public:
  BleCommand() :
      FrameworkCommand(BLE_COMMAND_NAME) {
  }

  virtual ~BleCommand() {}
  int runCommand(SocketClient *c, int argc, char ** argv);
};

/**
 * This class provides a wrapper around bledroid socket to help with
 * sending and receiving messages to the socket.
 */
class BledroidListener: private FrameworkListener {
public:
  BledroidListener() :
      FrameworkListener(BLE_SOCKET_NAME) {
    FrameworkListener::registerCmd(new BleCommand());
  }

  int start() {
    ALOGD("Starting BledroidListener");
    return FrameworkListener::startListener();
  }

  /**
   * Send a bluetooth related event to bleno
   */
  void sendEvent(const char *fmt, ...) {
    char event[MAX_MSG_SIZE];

    va_list argptr;
    va_start(argptr, fmt);
    int realEventSize = vsnprintf(event, sizeof(event), fmt, argptr);
    va_end(argptr);

    if (realEventSize < 0) {
      ALOGE("Message could not be properly encoded");
      return;
    }

    if (static_cast<size_t>(realEventSize) >= sizeof(event)) {
      ALOGE("Message size %d will not fit into buffer of size %d, cannot send: "
            "'%s'",
            realEventSize,
            sizeof(event),
            event);
      abort();
    }

    ALOGD("Broadcasting %s", event);
    FrameworkListener::sendBroadcast(200, event, false);
  }
};

/**
 *
 */
class ThreadWaiter {
public:
  class AutoSignal {
  public:
    AutoSignal(ThreadWaiter *threadWaiter,
               WaitType waitType,
               bool abortIfNotWaiting)
      : waiter(threadWaiter)
      , targetWaitType(waitType)
      , abort(abortIfNotWaiting)
    { }

    ~AutoSignal() { if (waiter) { waiter->signal(targetWaitType, abort); } }

  private:
    ThreadWaiter *const waiter;
    const WaitType targetWaitType;
    const bool abort;
  };

  ThreadWaiter()
    : mainThreadMutex("ThreadWaiter::mainThreadMutex")
    , currentWaitType(WaitNone)
  {}

  ~ThreadWaiter() {
    if (currentWaitType != WaitNone) {
      ALOGE("Waiting for type %d at shutdown", currentWaitType);
      abort();
    }
  }

  Mutex::Autolock autoLock() {
    return Mutex::Autolock(mainThreadMutex);
  }

  AutoSignal autoSignal(WaitType waitType,
                        bool condition = true,
                        bool abortIfNotWaiting = true) {
    return AutoSignal(condition ? this : nullptr, waitType, abortIfNotWaiting);
  }

  void wait(WaitType waitType) {
    // Must be locked here, but no way to assert it...

    if (currentWaitType != WaitNone) {
      ALOGE("Cannot wait for type %d, already waiting on type %d",
            waitType,
            currentWaitType);
      abort();
    }

    currentWaitType = waitType;

    while (currentWaitType != WaitNone) {
      int err = mainThreadCondition.waitRelative(mainThreadMutex,
                                                 kDefaultWaitTimeout);
      if (err) {
        ALOGE("Waiting for type %d failed: %d", currentWaitType, err);

        // If this wait type is whitelisted then we can ignore it.
        for (const auto &toleratedWaitType : kToleratedWaitFailures) {
          if (toleratedWaitType == currentWaitType) {
            ALOGD("Wait type is whitelisted, not exiting");
            return;
          }
        }

        // Bluedroid sometimes just drops callbacks on the floor and there is no
        // way for us to tell except by timing out. When this happens we can't
        // really recover in any meaningful way so we simply exit and allow the
        // process to restart.
        ALOGE("Exiting");

        // Don't warn about this wait type again.
        currentWaitType = WaitNone;

        exit(1);
      }
    }
  }

private:
  void signal(WaitType waitType, bool abortIfNotWaiting) {
    auto lock = autoLock();

    if (currentWaitType != waitType) {
      if (currentWaitType == WaitNone) {
        ALOGE("Cannot signal, not waiting");
      } else {
        ALOGE("Cannot signal for type %d, waiting on type %d",
              waitType,
              currentWaitType);
      }

      if (abortIfNotWaiting) {
        abort();
      }

      return;
    }

    currentWaitType = WaitNone;

    mainThreadCondition.signal();
  }

private:
  Mutex mainThreadMutex;
  Condition mainThreadCondition;
  WaitType currentWaitType;
};

bool hexstr_to_buffer(const char *str, char *buffer, size_t length) {
  if (!str) {
    ALOGE("hexstr_to_buffer with no string");
    return false;
  }

  char b[3] = { };
  b[2] = '\0';

  for (size_t index = 0; index < length; index++) {
    b[0] = str[index * 2];
    b[1] = str[(index * 2) + 1];

    if (!isxdigit(b[0])) {
      ALOGE("[%u] Not a hex digit '%c'", index * 2, b[0]);
      return false;
    }

    if (!isxdigit(b[1])) {
      ALOGE("[%u] Not a hex digit '%c'", (index * 2) + 1, b[1]);
      return false;
    }

    buffer[index] = strtol(b, nullptr, 16);
  }

  return true;
}

// |str| is expected to be of the form:
//   - '0000abcd00001000800000805f9b34fb' (128-bit uuid)
//   - '0000abcd' (32-bit uuid)
//   - 'abcd' (16-bit uuid)
// All of these forms are equivalent.
bool str_to_uuid(char const *str, bt_uuid_t &uuid) {
  if (!str) {
    return false;
  }

  int startIndex;
  int byteCount;

  switch (strlen(str)) {
    case 32: // 128-bit uuid
      startIndex = 15;
      byteCount = 16;
      break;
    case 8: // 32-bit uuid
      startIndex = 15;
      byteCount = 4;
      uuid = kBluetoothBaseUuid;
      break;
    case 4: // 16-bit uuid
      startIndex = 13;
      byteCount = 2;
      uuid = kBluetoothBaseUuid;
      break;

    default:
      ALOGE("Invalid length for uuid '%s' (%u)", str, strlen(str));
      return false;
  }

  char b[3] = { };
  b[2] = '\0';

  for (int index = 0; index < byteCount; index++) {
    b[0] = str[index * 2];
    b[1] = str[(index * 2) + 1];
    uuid.uu[startIndex - index] = strtol(b, nullptr, 16);
  }

  return true;
}

void generate_uuid(bt_uuid_t &uuid) {
  // Needs to fit a string of the form:
  //   892f8273-20ef-4a61-a408-8f0fedf3e962
  static char buffer[37] = { 0 };

  int fd = TEMP_FAILURE_RETRY(open("/proc/sys/kernel/random/uuid", O_RDONLY));
  if (fd == -1) {
    ALOGE("failed to open uuid %d", errno);
    abort();
  }

  const ssize_t read_count =
    TEMP_FAILURE_RETRY(read(fd, buffer, sizeof(buffer)));
  const int read_errno = errno;

  TEMP_FAILURE_RETRY(close(fd));
  buffer[sizeof(buffer) - 1] = '\0';

  if (read_count != sizeof(buffer)) {
    ALOGE("failed to read uuid %d %d", read_count, read_errno);
    abort();
  }

  // Remove dashes.
  memmove(buffer + 8, buffer + 9, 4);
  memmove(buffer + 12, buffer + 14, 4);
  memmove(buffer + 16, buffer + 19, 4);
  memmove(buffer + 20, buffer + 24, 12);
  buffer[32] = '\0';

  if (!str_to_uuid(buffer, uuid)) {
    ALOGE("failed to convert uuid '%s'", buffer);
    abort();
  }
}

// str is expected to be of the form: 60030894929B
bool str_to_addr(char const *str, bt_bdaddr_t &addr) {
  auto* buffer = reinterpret_cast<char*>(&addr.address);
  const size_t bufferLength = sizeof(addr.address);

  return hexstr_to_buffer(str, buffer, bufferLength);
}

void addr_to_str(const bt_bdaddr_t &addr, char (&str)[18]) {
  snprintf(str,
           sizeof(str),
           "%02X:%02X:%02X:%02X:%02X:%02X",
           addr.address[0],
           addr.address[1],
           addr.address[2],
           addr.address[3],
           addr.address[4],
           addr.address[5]);
}

int str_to_uuids(char *&saveptr,
                 int &numServices,
                 std::auto_ptr<bt_uuid_t> &serviceUuids) {
  const char *numServicesStr = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!numServicesStr, "Malformed uuid string (no numServices)");

  numServices = atoi(numServicesStr);
  LOG_ERROR(numServices < 0,
            "Malformed uuid string (negative numServices)");

  std::auto_ptr<bt_uuid_t> uuids;
  if (numServices) {
    uuids.reset(new bt_uuid_t[numServices]);
    LOG_ERROR(!uuids.get(), "Out of memory");

    for (int i = 0; i < numServices; i++) {
      char *uuid = strtok_r(NULL, " \n", &saveptr);
      LOG_ERROR(!str_to_uuid(uuid, uuids.get()[i]),
                "Malformed startScanning (invalid uuid)");
    }
  }

  serviceUuids = uuids;
  return BT_STATUS_SUCCESS;
}

bool uuid_to_str(const bt_uuid_t &uuid, char *str, size_t strLength) {
  constexpr size_t kBaseUuidTestLength32 = 12;
  static_assert(kBaseUuidTestLength32 < sizeof(uuid), "Bad size for uuid");

  // See if the uuid matches the bluetooth base uuid pattern. If not then we
  // have a 128bit uuid and we have to stringify the whole thing.
  if (memcmp(&uuid, &kBluetoothBaseUuid, kBaseUuidTestLength32)) {
    constexpr char kFormat[] =
      "%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x%02x";
    constexpr size_t kPrintLength = 33;
    if (strLength < kPrintLength) {
      ALOGE("Buffer too small!");
      return false;
    }
    snprintf(str, kPrintLength, kFormat,
             uuid.uu[15], uuid.uu[14], uuid.uu[13], uuid.uu[12],
             uuid.uu[11], uuid.uu[10], uuid.uu[9], uuid.uu[8],
             uuid.uu[7], uuid.uu[6], uuid.uu[5], uuid.uu[4],
             uuid.uu[3], uuid.uu[2], uuid.uu[1], uuid.uu[0]);
    return true;
  }

  constexpr size_t kBaseUuidTestLength16 = 2;
  const uint8_t *uuidTestStart =
    reinterpret_cast<const uint8_t*>(&uuid) +
    sizeof(uuid) -
    kBaseUuidTestLength16;
  const uint8_t *baseTestStart =
    reinterpret_cast<const uint8_t*>(&kBluetoothBaseUuid) +
    sizeof(kBluetoothBaseUuid) -
    kBaseUuidTestLength16;

  // Now test the last 2 bytes against the pattern. If they are not 0 then we
  // we have a 32bit uuid and we only need to stringify the last 4 bytes.
  if (memcmp(uuidTestStart, baseTestStart, kBaseUuidTestLength16)) {
    constexpr char kFormat[] = "%02x%02x%02x%02x";
    constexpr size_t kPrintLength = 9;
    if (strLength < kPrintLength) {
      ALOGE("Buffer too small!");
      return false;
    }
    snprintf(str, kPrintLength, kFormat,
             uuid.uu[15], uuid.uu[14], uuid.uu[13], uuid.uu[12]);
    return true;
  }

  // This is a 16bit uuid and we only need to stringify 2 bytes.
  constexpr char kFormat[] = "%02x%02x";
  constexpr size_t kPrintLength = 5;
  if (strLength < kPrintLength) {
    ALOGE("Buffer too small!");
    return false;
  }
  snprintf(str, kPrintLength, kFormat, uuid.uu[13], uuid.uu[12]);
  return true;
}

//
// Global state. Make sure to update bt_cleanup() if you add global members!
//
bt_state_t adapter_state = BT_STATE_OFF;
int gatt_server_if = -1;
int gatt_client_listen_scan_if = -1;
int gatt_client_beacon_if = -1;
bool desired_listen_state = false;
bool gatt_client_scanning = false;
bool adapter_supports_multi_adv = false;
btgatt_interface_t const *gatt = nullptr;
hw_device_t *device = nullptr;
ThreadWaiter mainThreadWaiter;
BledroidListener bledroid;

// HORRIBLE but looks like the callback for register_for_notification gets a
// garbage value for the connection_id paramater...
int connection_id_during_register_for_notification = -1;

// HORRIBLE but if readRemoteRssi fails sometimes it hands out a garbage address
// and we can't tell higher up that the callback should be routed to the object
// that requested it...
bt_bdaddr_t address_during_rssi_update = kInvalidAddr;

// Must hold mainThreadWaiter's mutex to access these!
int gatt_client_connection_count = 0;
int disconnected_if_list[10] = { -1, -1, -1, -1, -1, -1, -1, -1, -1, -1 };
bool disconnected_if_list_busy = false;

// These three members are used during a call to connect (because bluedroid
// doesn't allow you to pass any closure pointers around...). They're set and
// accessed on multiple threads but locks are used to ensure sequential
// access and consistency.
int client_if_during_connect = -1;
bt_uuid_t uuid_during_connect = kInvalidUuid;
bool connect_failed = false;

const size_t disconnected_if_list_count =
  sizeof(disconnected_if_list) / sizeof(disconnected_if_list[0]);

bool advertising = false;
int status_during_advertise = 0;
bool beaconActive = false;

//
// bt_os_callouts_t
//
static bool set_wake_alarm(uint64_t delay_millis, bool should_wake, alarm_cb cb,
    void *data) {
  static timer_t timer;
  static bool timer_created;

  if (!timer_created) {
    struct sigevent sigevent;
    memset(&sigevent, 0, sizeof(sigevent));
    sigevent.sigev_notify = SIGEV_THREAD;
    sigevent.sigev_notify_function = (void (*)(union sigval))cb;
    sigevent.sigev_value.sival_ptr = data;
    timer_create(CLOCK_MONOTONIC, &sigevent, &timer);
    timer_created = true;
  }

  struct itimerspec new_value;
  new_value.it_value.tv_sec = delay_millis / 1000;
  new_value.it_value.tv_nsec = (delay_millis % 1000) * 1000 * 1000;
  new_value.it_interval.tv_sec = 0;
  new_value.it_interval.tv_nsec = 0;
  timer_settime(timer, 0, &new_value, NULL);

  return true;
}

static int bledroid_acquire_wake_lock(const char *lock_name) {
  acquire_wake_lock(PARTIAL_WAKE_LOCK, kWakeLockId);
  ALOGV("Acquired wake lock");
  return BT_STATUS_SUCCESS;
}

static int bledroid_release_wake_lock(const char *lock_name) {
  release_wake_lock(kWakeLockId);
  ALOGV("Released wake lock");
  return BT_STATUS_SUCCESS;
}

static bt_os_callouts_t os_callouts = {
  sizeof(bt_os_callouts_t),
  set_wake_alarm,
  bledroid_acquire_wake_lock,
  bledroid_release_wake_lock,
};

//
// bt_callbacks_t
//

void bt_adapter_state_changed_callback(bt_state_t state) {
  Tracer trc("bt_adapter_state_changed_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitEnableDisable);

  adapter_state = state;
  bledroid.sendEvent("!adapterState powered%s",
                     state == BT_STATE_OFF ? "Off" : "On");
}

void bt_adapter_properties_callback(bt_status_t status,
                                    int num_properties,
                                    bt_property_t *properties) {
  Tracer trc("bt_adapter_properties_callback");

  for (int i = 0; i < num_properties; i++) {
    const bt_property_t &prop = properties[i];

    switch (prop.type) {
      case BT_PROPERTY_BDADDR: {
        bt_bdaddr_t *addr = (bt_bdaddr_t *) prop.val;
        bledroid.sendEvent("!address %02X:%02X:%02X:%02X:%02X:%02X",
          addr->address[0],
          addr->address[1],
          addr->address[2],
          addr->address[3],
          addr->address[4],
          addr->address[5]
        );
        break;
      }

      case BT_PROPERTY_LOCAL_LE_FEATURES: {
        auto *features = static_cast<bt_local_le_features_t *>(prop.val);
#ifdef TARGET_GE_MARSHMALLOW
        ALOGV("BT_PROPERTY_LOCAL_LE_FEATURES "
                "version_supported=%u "
                "local_privacy_enabled=%u "
                "max_adv_instance=%u "
                "rpa_offload_supported=%u "
                "max_irk_list_size=%u "
                "max_adv_filter_supported=%u "
                "activity_energy_info_supported=%u "
                "scan_result_storage_size=%u "
                "total_trackable_advertisers=%u "
                "extended_scan_support=%u "
                "debug_logging_supported=%u",
              features->version_supported,
              features->local_privacy_enabled,
              features->max_adv_instance,
              features->rpa_offload_supported,
              features->max_irk_list_size,
              features->max_adv_filter_supported,
              features->activity_energy_info_supported,
              features->scan_result_storage_size,
              features->total_trackable_advertisers,
              features->extended_scan_support ? 1 : 0,
              features->debug_logging_supported ? 1 : 0);
#else // TARGET_GE_MARSHMALLOW
        ALOGV("BT_PROPERTY_LOCAL_LE_FEATURES "
                "local_privacy_enabled=%u "
                "max_adv_instance=%u "
                "rpa_offload_supported=%u "
                "max_irk_list_size=%u "
                "max_adv_filter_supported=%u "
                "scan_result_storage_size_lobyte=%u "
                "scan_result_storage_size_hibyte=%u "
                "activity_energy_info_supported=%u",
              features->local_privacy_enabled,
              features->max_adv_instance,
              features->rpa_offload_supported,
              features->max_irk_list_size,
              features->max_adv_filter_supported,
              features->scan_result_storage_size_lobyte,
              features->scan_result_storage_size_hibyte,
              features->activity_energy_info_supported);
#endif // TARGET_GE_MARSHMALLOW
        adapter_supports_multi_adv = features->max_adv_instance >= 5;
        break;
      }

      default:
        break;
    }
  }
}

/** GET/SET Remote Device Properties callback */
void bt_remote_device_properties_callback(bt_status_t status,
    bt_bdaddr_t *bd_addr, int num_properties, bt_property_t *properties) {
  Tracer trc("bt_remote_device_properties_callback");
  ALOGE("bt_remote_device_properties_callback");
}

void bt_device_found_callback(int num_properties, bt_property_t *properties) {
  Tracer trc("bt_device_found_callback");
  ALOGE("bt_device_found_callback. num_properties=%d", num_properties);
}

void bt_discovery_state_changed_cb(bt_discovery_state_t state) {
  Tracer trc("bt_discovery_state_changed_cb");
  ALOGE("bt_discovery_state_changed_cb. state=%d", state);
}


/**
 * Bluetooth Legacy PinKey Request callback
 */
void bt_pin_request_callback(bt_bdaddr_t *remote_bd_addr, bt_bdname_t *bd_name,
    uint32_t cod
#ifdef QBLUETOOTH_L
    , uint8_t secure
#endif
#ifdef TARGET_GE_MARSHMALLOW
    , bool min_16_digit
#endif
  ) {
  Tracer trc("bt_pin_request_callback");
  ALOGE("bt_pin_request_callback");
}

/**
 * Bluetooth SSP Request callback - Just Works & Numeric Comparison
 */
void bt_ssp_request_callback(bt_bdaddr_t *remote_bd_addr, bt_bdname_t *bd_name,
    uint32_t cod, bt_ssp_variant_t pairing_variant, uint32_t pass_key) {
  Tracer trc("bt_ssp_request_callback");
  ALOGE("bt_ssp_request_callback");
}

/**
 * Bluetooth Bond state changed callback
 * Invoked in response to create_bond, cancel_bond or remove_bond
 */
void bt_bond_state_changed_callback(bt_status_t status,
    bt_bdaddr_t *remote_bd_addr, bt_bond_state_t state) {
  Tracer trc("bt_bond_state_changed_callback");
  ALOGE("bt_bond_state_changed_callback: state=%d", state);
}

/**
 * Bluetooth ACL connection state changed callback
 */
void bt_acl_state_changed_callback(bt_status_t status,
    bt_bdaddr_t *remote_bd_addr, bt_acl_state_t state) {
  Tracer trc("bt_acl_state_changed_callback");
  bt_bdaddr_t *bda = remote_bd_addr;
  ALOGV("bt_acl_state_changed_callback. status=%d state=%d remote=%02X:%02X:%02X:%02X:%02X:%02X",
    status, state,
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5]);
}

void bt_callback_thread_event(bt_cb_thread_evt /* evt */) {
  Tracer trc("bt_callback_thread_event");
}

/**
 * Bluetooth Test Mode Callback
 * Receive any HCI event from controller. Must be in DUT Mode for this callback
 * to be received
 */
void bt_dut_mode_recv_callback(uint16_t opcode, uint8_t *buf, uint8_t len) {
  Tracer trc("bt_dut_mode_recv_callback");
  ALOGE("bt_dut_mode_recv_callback");
}

/**
 * LE Test mode callbacks
 * This callback shall be invoked whenever the le_tx_test, le_rx_test or
 * le_test_end is invoked.
 * The num_packets is valid only for le_test_end command
 */
void bt_le_test_mode_callback(bt_status_t status, uint16_t num_packets) {
  Tracer trc("bt_le_test_mode_callback");
  ALOGE("bt_le_test_mode_callback");
}

/**
 * Callback invoked when energy details are obtained
 * Ctrl_state-Current controller state-Active-1,scan-2,or idle-3 state as
 * defined by HCI spec.
 * If the ctrl_state value is 0, it means the API call failed
 * Time values-In milliseconds as returned by the controller
 * Energy used-Value as returned by the controller
 * Status-Provides the status of the read_energy_info API call
 */
void bt_energy_info_callback(bt_activity_energy_info *energy_info) {
  ALOGE("bt_energy_info_callback");
}

#ifdef QBLUETOOTH_L
/**
 *  Callback invoked when write rssi threshold command complete
 */
void bt_le_lpp_write_rssi_thresh_callback(bt_bdaddr_t *bda, int status) {
  Tracer trc("bt_le_lpp_write_rssi_thresh_callback");
  ALOGE("bt_le_lpp_write_rssi_thresh_callback");
}

/**
 * Callback invoked when read rssi threshold command complete
 */
void bt_le_lpp_read_rssi_thresh_callback(bt_bdaddr_t *bda, int low, int upper,
    int alert, int status) {
  Tracer trc("bt_le_lpp_read_rssi_thresh_callback");
  ALOGE("bt_le_lpp_read_rssi_thresh_callback");
}

/**
 * Callback invoked when enable or disable rssi monitor command complete
 */
void bt_le_lpp_enable_rssi_monitor_callback(bt_bdaddr_t *bda,
    int enable, int status) {
  Tracer trc("bt_le_lpp_enable_rssi_monitor_callback");
  ALOGE("bt_le_lpp_enable_rssi_monitor_callback");
}

/**
 * Callback triggered when rssi threshold event reported
 */
void bt_le_lpp_rssi_threshold_evt_callback(bt_bdaddr_t *bda,
    int evt_type, int rssi) {
  Tracer trc("bt_le_lpp_rssi_threshold_evt_callback");
  ALOGE("bt_le_lpp_rssi_threshold_evt_callback");
}
#endif

#ifdef QBLUETOOTH_HCI_CMD_SEND
/** Bluetooth HCI event Callback */
/* Receive any HCI event from controller for raw commands */
void bt_hci_event_recv_callback(uint8_t event_code, uint8_t *buf, uint8_t len)
{
  Tracer trc("bt_hci_event_recv_callback");
  ALOGE("bt_hci_event_recv_callback");
}
#endif

bt_callbacks_t bt_callbacks = {
  sizeof(bt_callbacks_t),
  bt_adapter_state_changed_callback,
  bt_adapter_properties_callback,
  bt_remote_device_properties_callback,
  bt_device_found_callback,
  bt_discovery_state_changed_cb,
  bt_pin_request_callback,
  bt_ssp_request_callback,
  bt_bond_state_changed_callback,
  bt_acl_state_changed_callback,
  bt_callback_thread_event,
  bt_dut_mode_recv_callback,
  bt_le_test_mode_callback,
  bt_energy_info_callback,
#ifdef QBLUETOOTH_L
  bt_le_lpp_write_rssi_thresh_callback,
  bt_le_lpp_read_rssi_thresh_callback,
  bt_le_lpp_enable_rssi_monitor_callback,
  bt_le_lpp_rssi_threshold_evt_callback,
#endif
#ifdef QBLUETOOTH_HCI_CMD_SEND
  bt_hci_event_recv_callback,
#endif
};

//
// btgatt_client_callbacks_t
//

void gatt_register_client_callback(int status,
                                   int client_if,
                                   bt_uuid_t *app_uuid) {
  Tracer trc("gatt_register_client_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitRegisterClient);

  char uuid[33] = { 0 };

  if (status) {
    if (!uuid_to_str(*app_uuid, uuid, sizeof(uuid))) {
      ALOGE("failed to convert uuid to string");
    }
    ALOGE("register_client failed '%s', error=%d", uuid, status);
    return;
  }

  if (client_if_during_connect == -1 &&
      !memcmp(app_uuid, &uuid_during_connect, sizeof(*app_uuid))) {
    client_if_during_connect = client_if;
  } else if (gatt_client_listen_scan_if == -1 &&
             !memcmp(app_uuid, &kClientListenScanUuid, sizeof(*app_uuid))) {
    gatt_client_listen_scan_if = client_if;
  } else if (gatt_client_beacon_if == -1 &&
             !memcmp(app_uuid, &kClientBeaconUuid, sizeof(*app_uuid))) {
    gatt_client_beacon_if = client_if;
  } else {
    if (!uuid_to_str(*app_uuid, uuid, sizeof(uuid))) {
      ALOGE("failed to convert uuid to string");
    }
    ALOGE("not waiting for uuid '%s'", uuid);
  }
}

void gatt_client_scan_result_callback(bt_bdaddr_t* bda, int rssi,
    uint8_t* adv_data) {
  Tracer trc("gatt_client_scan_result_callback");

  char address[18];
  addr_to_str(*bda, address);

  ALOGV("gatt_client_scan_result_callback. %s rssi=%d", address, rssi);

  // Each advertisement packet contains a max of 31 bytes of payload data.
  // Bluedroid currently forces an 'active' scan mode so the bluedroid driver
  // automatically sends 'scan response' packets when it detects a new
  // peripheral. It then bundles any second advertisement packet's payload data
  // that it receives with the first here bringing the maximum payload data size
  // up to 62 bytes.
  static const int kMaxAdvertisingDataSize = 62;

  // Need an additional byte to null-terminate.
  char advertisingDataHexString[(kMaxAdvertisingDataSize * 2) + 1];

  // The length of the first packet is stored in the first byte.
  uint8_t bytesToRead = adv_data[0] + 1;

  uint8_t bytesWritten = 0;
  bool lastByte = false;

  while (bytesWritten < kMaxAdvertisingDataSize) {
    const uint8_t& thisByte = adv_data[bytesWritten];

    sprintf(advertisingDataHexString + (bytesWritten * 2), "%02x", thisByte);

    bytesWritten++;
    bytesToRead--;

    if (lastByte) {
      break;
    }

    if (!bytesToRead) {
      // That was the last byte for the current packet. Get the next packet
      // length.
      bytesToRead = adv_data[bytesWritten] + 1;
      if (bytesToRead == 1) {
        // That was the last packet. Write the final byte.
        lastByte = 1;
      }
    }
  }

  // Always null-terminate.
  advertisingDataHexString[bytesWritten * 2] = '\0';

  bledroid.sendEvent("!discover %s %d %s",
                     address,
                     rssi,
                     advertisingDataHexString);
}

/**
 * GATT open callback invoked in response to open
 */
void gatt_client_connect_callback(int conn_id,
                                  int status,
                                  int client_if,
                                  bt_bdaddr_t* bda) {
  Tracer trc("gatt_client_connect_callback");

  {
    auto lock = mainThreadWaiter.autoLock();

    if (!status) {
      gatt_client_connection_count++;
    }
  }

  auto signal = mainThreadWaiter.autoSignal(WaitConnect, true, false);

  char address[18];
  addr_to_str(*bda, address);

  connect_failed = !!status;

  char uuid[33] = { 0 };
  if (!uuid_to_str(uuid_during_connect, uuid, sizeof(uuid))) {
    ALOGE("failed to convert uuid to string");
    return;
  }

  ALOGV("gatt_client_connect_callback: uuid=%s conn_id=%d status=%d "
        "client_if=%d remote=%s",
        uuid,
        conn_id,
        status,
        client_if,
        address);

  bledroid.sendEvent("!clientConnect %d %s %d %d",
                     client_if,
                     address,
                     status,
                     conn_id);
}

/**
 * Callback invoked in response to close
 */
void gatt_client_disconnect_callback(int conn_id,
                                     int status,
                                     int client_if,
                                     bt_bdaddr_t* bda) {
  Tracer trc("gatt_client_disconnect_callback");

  bool mismatch = false;
  bool scheduledUnregister = false;
  {
    auto lock = mainThreadWaiter.autoLock();

    if (gatt_client_connection_count) {
      gatt_client_connection_count--;
    } else {
      mismatch = true;
    }

    for (size_t index = 0; index < disconnected_if_list_count; index++) {
      if (disconnected_if_list[index] == -1) {
        disconnected_if_list[index] = client_if;
        disconnected_if_list_busy = true;
        scheduledUnregister = true;
        break;
      }
    }
  }

  auto signal = mainThreadWaiter.autoSignal(WaitDisconnect, true, false);

  if (mismatch) {
    ALOGE("Mismatched connect/disconnect callbacks!");
  }

  if (!scheduledUnregister) {
    ALOGE("too many disconnected interfaces, can't schedule another");
    abort();
  }

  char address[18];
  addr_to_str(*bda, address);

  ALOGV("gatt_client_disconnect_callback: conn_id=%d status=%d client_if=%d "
        "remote=%s",
        conn_id,
        status,
        client_if,
        address);

  bledroid.sendEvent("!clientDisconnect %s %d %d", address, status, conn_id);
}

void gatt_client_search_complete_callback(int conn_id, int status) {
  Tracer trc("gatt_client_search_complete_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitSearchService);

  ALOGV("gatt_client_search_complete_callback: conn_id=%d status=%d",
        conn_id,
        status);

  bledroid.sendEvent("!serviceDiscoverComplete %d %d", conn_id, status);
}

void gatt_client_search_result_callback(int conn_id,
                                        btgatt_srvc_id_t *srvc_id) {
  Tracer trc("gatt_client_search_result_callback");

  char uuid[33];
  if (!uuid_to_str(srvc_id->id.uuid, uuid, sizeof(uuid))) {
    ALOGE("Failed to convert!");
    return;
  }

  ALOGV("gatt_client_search_result_callback: conn_id=%d srvc_id=%s",
        conn_id,
        uuid);

  bledroid.sendEvent("!serviceDiscover %d %s %u %u",
                     conn_id,
                     uuid,
                     srvc_id->id.inst_id,
                     srvc_id->is_primary ? 1 : 0);
}

/**
 * GATT characteristic enumeration result callback
 */
void gatt_client_get_characteristic_callback(int conn_id,
                                             int status,
                                             btgatt_srvc_id_t *srvc_id,
                                             btgatt_gatt_id_t *char_id,
                                             int char_prop) {
  Tracer trc("gatt_client_get_characteristic_callback");

  auto signal = mainThreadWaiter.autoSignal(WaitGetCharacteristic, status);

  char serviceUuid[33];
  if (!uuid_to_str(srvc_id->id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  if (status) {
    ALOGV("gatt_client_get_characteristic_callback: conn_id=%d status=%d "
          "srvc_id=%s",
          conn_id,
          status,
          serviceUuid);

    bledroid.sendEvent("!characteristicDiscoverComplete %d %s",
                       conn_id,
                       serviceUuid);
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(char_id->uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  ALOGV("gatt_client_get_characteristic_callback: conn_id=%d status=%d "
        "srvc_id=%s char_id=%s char_prop=%d",
        conn_id,
        status,
        serviceUuid,
        characteristicUuid,
        char_prop);

  bledroid.sendEvent("!characteristicDiscover %d %s %s %u %d",
                     conn_id,
                     serviceUuid,
                     characteristicUuid,
                     char_id->inst_id,
                     char_prop);

  int err = gatt->client->get_characteristic(conn_id, srvc_id, char_id);
  if (err != BT_STATUS_SUCCESS) {
    ALOGE("Failed to discover next characteristic: %d", err);
  }
}

/**
 * GATT descriptor enumeration result callback
 */
void gatt_client_get_descriptor_callback(int conn_id,
                                         int status,
                                         btgatt_srvc_id_t *srvc_id,
                                         btgatt_gatt_id_t *char_id,
                                         btgatt_gatt_id_t *descr_id) {
  Tracer trc("gatt_client_get_descriptor_callback");

  auto signal = mainThreadWaiter.autoSignal(WaitGetDescriptor, status);

  char serviceUuid[33];
  if (!uuid_to_str(srvc_id->id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(char_id->uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  if (status) {
    ALOGV("gatt_client_get_descriptor_callback: conn_id=%d status=%d "
          "srvc_id=%s char_id=%s",
          conn_id,
          status,
          serviceUuid,
          characteristicUuid);

    bledroid.sendEvent("!descriptorDiscoverComplete %d %s %s",
                       conn_id,
                       serviceUuid,
                       characteristicUuid);
    return;
  }

  char descriptorUuid[33];
  if (!uuid_to_str(descr_id->uuid,
                   descriptorUuid,
                   sizeof(descriptorUuid))) {
    ALOGE("Failed to convert descriptorUuid!");
    return;
  }

  ALOGV("gatt_client_get_descriptor_callback: conn_id=%d status=%d "
        "srvc_id=%s char_id=%s descr_id=%s",
        conn_id,
        status,
        serviceUuid,
        characteristicUuid,
        descriptorUuid);

  bledroid.sendEvent("!descriptorDiscover %d %s %s %s %u",
                     conn_id,
                     serviceUuid,
                     characteristicUuid,
                     descriptorUuid,
                     descr_id->inst_id);

  int err = gatt->client->get_descriptor(conn_id, srvc_id, char_id, descr_id);
  if (err != BT_STATUS_SUCCESS) {
    ALOGE("Failed to discover next descriptor: %d", err);
  }
}

/**
 * GATT included service enumeration result callback
 */
void gatt_client_get_included_service_callback(int conn_id,
                                               int status,
                                               btgatt_srvc_id_t *srvc_id,
                                               btgatt_srvc_id_t *incl_srvc_id) {
  Tracer trc("gatt_client_get_included_service_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitGetIncludedService, status);

  char parentUuid[33];
  if (!uuid_to_str(srvc_id->id.uuid, parentUuid, sizeof(parentUuid))) {
    ALOGE("Failed to convert parentUuid!");
    return;
  }

  if (status) {
    ALOGV("gatt_clienc_get_included_service_callback: conn_id=%d status=%d "
          "srvc_id=%s",
          conn_id,
          status,
          parentUuid);

    bledroid.sendEvent("!includedServiceDiscoverComplete %d %s",
                       conn_id,
                       parentUuid);
    return;
  }

  char includedUuid[33];
  if (!uuid_to_str(incl_srvc_id->id.uuid, includedUuid, sizeof(includedUuid))) {
    ALOGE("Failed to convert includedUuid!");
    return;
  }

  ALOGV("gatt_clienc_get_included_service_callback: conn_id=%d status=%d "
        "srvc_id=%s incl_srvc_id=%s",
        conn_id,
        status,
        parentUuid,
        includedUuid);

  bledroid.sendEvent("!includedServiceDiscover %d %s %s %u %u",
                     conn_id,
                     parentUuid,
                     includedUuid,
                     incl_srvc_id->id.inst_id,
                     incl_srvc_id->is_primary ? 1 : 0);

  int err = gatt->client->get_included_service(conn_id, srvc_id, incl_srvc_id);
  if (err != BT_STATUS_SUCCESS) {
    ALOGE("Failed to discover next included service: %d", err);
  }
}

void gatt_client_register_for_notification_callback(int /* conn_id */,
                                                    int registered,
                                                    int status,
                                                    btgatt_srvc_id_t *srvc_id,
                                                    btgatt_gatt_id_t *char_id) {
  Tracer trc("gatt_client_register_for_notification_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitRegisterForNotification);

  char serviceUuid[33];
  if (!uuid_to_str(srvc_id->id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(char_id->uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  ALOGV("gatt_client_register_for_notification_callback: conn_id=%d "
        "registered=%d status=%d srvc_id=%s char_id=%s",
        connection_id_during_register_for_notification,
        registered,
        status,
        serviceUuid,
        characteristicUuid);

  bledroid.sendEvent("!notifyEnable %d %d %d %s %s",
                     connection_id_during_register_for_notification,
                     registered,
                     status,
                     serviceUuid,
                     characteristicUuid);
}

bool bt_convert_value(const uint8_t *value,
                      uint16_t valueLength,
                      char *buffer,
                      uint16_t bufferLength) {
  static_assert(BTGATT_MAX_ATTR_LEN <= UINT16_MAX,
                "BTGATT_MAX_ATTR_LEN doesn't fit in uint16_t!");

  if (((size_t(valueLength) * 2) + 1) > size_t(bufferLength)) {
    ALOGE("Buffer too small!");
    return false;
  }

  if (valueLength > uint16_t(BTGATT_MAX_ATTR_LEN)) {
    ALOGE("Impossible length!");
    return false;
  }

  for (uint16_t index = 0; index < valueLength; index++) {
    sprintf(buffer + (index * 2), "%02x", value[index]);
  }
  buffer[valueLength * 2] = '\0';

  return true;
}

void gatt_client_notify_callback(int conn_id, btgatt_notify_params_t *p_data) {
  Tracer trc("gatt_client_notify_callback");

  char serviceUuid[33];
  if (!uuid_to_str(p_data->srvc_id.id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(p_data->char_id.uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  ALOGV("gatt_client_notify_callback: conn_id=%d srvc_id=%s char_id=%s "
        "is_notify=%u value.len=%u",
        conn_id,
        serviceUuid,
        characteristicUuid,
        p_data->is_notify,
        p_data->len);

  if (p_data->len) {
    char data[(BTGATT_MAX_ATTR_LEN * 2) + 1];
    if (!bt_convert_value(p_data->value, p_data->len, data, sizeof(data))) {
      return;
    }

    bledroid.sendEvent("!notify %d %s %s %u %s",
                       conn_id,
                       serviceUuid,
                       characteristicUuid,
                       p_data->len,
                       data);
    return;
  }

  bledroid.sendEvent("!notify %d %s %s 0",
                     conn_id,
                     serviceUuid,
                     characteristicUuid);
}

void gatt_client_read_characteristic_callback(int conn_id,
                                              int status,
                                              btgatt_read_params_t *p_data) {
  Tracer trc("gatt_client_read_characteristic_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitReadCharacteristic);

  char serviceUuid[33];
  if (!uuid_to_str(p_data->srvc_id.id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(p_data->char_id.uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  ALOGV("gatt_client_read_characteristic_callback: conn_id=%d status=%d "
        "srvc_id=%s char_id=%s value.len=%u",
        conn_id,
        status,
        serviceUuid,
        characteristicUuid,
        p_data->value.len);

  if (p_data->value.len) {
    char data[(BTGATT_MAX_ATTR_LEN * 2) + 1];
    if (!bt_convert_value(p_data->value.value,
                          p_data->value.len,
                          data,
                          sizeof(data))) {
      return;
    }

    bledroid.sendEvent("!readCharacteristic %d %d %s %s %u %s",
                       conn_id,
                       status,
                       serviceUuid,
                       characteristicUuid,
                       p_data->value.len,
                       data);
    return;
  }

  bledroid.sendEvent("!readCharacteristic %d %d %s %s 0",
                     conn_id,
                     status,
                     serviceUuid,
                     characteristicUuid);
}

void gatt_client_write_characteristic_callback(int conn_id,
                                               int status,
                                               btgatt_write_params_t *p_data) {
  Tracer trc("gatt_client_write_characteristic_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitWriteCharacteristic);

  char serviceUuid[33];
  if (!uuid_to_str(p_data->srvc_id.id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(p_data->char_id.uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  ALOGV("gatt_client_write_characteristic_callback: conn_id=%d status=%d "
        "srvc_id=%s char_id=%s",
        conn_id,
        status,
        serviceUuid,
        characteristicUuid);

  bledroid.sendEvent("!writeCharacteristic %d %d %s %s",
                     conn_id,
                     status,
                     serviceUuid,
                     characteristicUuid);
}


void gatt_client_read_descriptor_callback(int conn_id,
                                          int status,
                                          btgatt_read_params_t *p_data) {
  Tracer trc("gatt_client_read_descriptor_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitReadDescriptor);

  char serviceUuid[33];
  if (!uuid_to_str(p_data->srvc_id.id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(p_data->char_id.uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  char descriptorUuid[33];
  if (!uuid_to_str(p_data->descr_id.uuid,
                   descriptorUuid,
                   sizeof(descriptorUuid))) {
    ALOGE("Failed to convert descriptorUuid!");
    return;
  }

  ALOGV("gatt_client_read_descriptor_callback: conn_id=%d status=%d srvc_id=%s "
        "char_id=%s descr_id=%s value.len=%u",
        conn_id,
        status,
        serviceUuid,
        characteristicUuid,
        descriptorUuid,
        p_data->value.len);

  if (p_data->value.len) {
    char data[(BTGATT_MAX_ATTR_LEN * 2) + 1];
    if (!bt_convert_value(p_data->value.value,
                          p_data->value.len,
                          data,
                          sizeof(data))) {
      return;
    }

    bledroid.sendEvent("!readDescriptor %d %d %s %s %s %u %s",
                       conn_id,
                       status,
                       serviceUuid,
                       characteristicUuid,
                       descriptorUuid,
                       p_data->value.len,
                       data);
    return;
  }

  bledroid.sendEvent("!readDescriptor %d %d %s %s %s 0",
                     conn_id,
                     status,
                     serviceUuid,
                     characteristicUuid,
                     descriptorUuid);
}

void gatt_client_write_descriptor_callback(int conn_id,
                                           int status,
                                           btgatt_write_params_t *p_data) {
  Tracer trc("gatt_client_write_descriptor_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitWriteDescriptor);

  char serviceUuid[33];
  if (!uuid_to_str(p_data->srvc_id.id.uuid, serviceUuid, sizeof(serviceUuid))) {
    ALOGE("Failed to convert serviceUuid!");
    return;
  }

  char characteristicUuid[33];
  if (!uuid_to_str(p_data->char_id.uuid,
                   characteristicUuid,
                   sizeof(characteristicUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  char descriptorUuid[33];
  if (!uuid_to_str(p_data->descr_id.uuid,
                   descriptorUuid,
                   sizeof(descriptorUuid))) {
    ALOGE("Failed to convert characteristicUuid!");
    return;
  }

  ALOGV("gatt_client_write_descriptor_callback: conn_id=%d status=%d "
        "srvc_id=%s char_id=%s descr_id=%s",
        conn_id,
        status,
        serviceUuid,
        characteristicUuid,
        descriptorUuid);

  bledroid.sendEvent("!writeDescriptor %d %d %s %s %s",
                     conn_id,
                     status,
                     serviceUuid,
                     characteristicUuid,
                     descriptorUuid);
}

void gatt_client_read_remote_rssi_callback(int client_if,
                                           bt_bdaddr_t* bda,
                                           int rssi,
                                           int status) {
  Tracer trc("gatt_client_read_remote_rssi_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitReadRemoteRssi);

  char address[18];
  const bt_bdaddr_t &addr = status ? address_during_rssi_update : *bda;
  addr_to_str(addr, address);

  ALOGV("gatt_client_read_remote_rssi_callback: client_if=%d bda=%s rssi=%d "
        "status=%d",
        client_if,
        address,
        rssi,
        status);

  bledroid.sendEvent("!rssiUpdate %s %d %d", address, rssi, status);
}

void gatt_client_listen_callback(int status, int server_if) {
  Tracer trc("gatt_client_listen_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitListen);

  ALOGV("gatt_client_listen_callback: desired=%u status=%d server_if=%d",
        desired_listen_state ? 1 : 0,
        status,
        server_if);

  bledroid.sendEvent("!advertisingSt%s %d",
                     desired_listen_state ? "art" : "op",
                     status);
}

void gatt_client_configure_mtu_callback(int conn_id, int status, int mtu) {
  Tracer trc("gatt_client_configure_mtu_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitMTUChange, true, false);

  ALOGV("gatt_client_configure_mtu_callback: conn_id=%d status=%d mtu=%d",
        conn_id,
        status,
        mtu);
}

/**
 * Callback invoked when a scan filter configuration command has completed
 */
void gatt_client_scan_filter_cfg_callback(int action,
                                          int client_if,
                                          int status,
                                          int filt_type,
                                          int avbl_space) {
  Tracer trc("gatt_client_scan_filter_cfg_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitScanFilterConfig);

  ALOGV("gatt_client_scan_filter_cfg_callback: action=%d client_if=%d "
        "status=%d filt_type=%d avbl_space=%d",
        action, client_if, status, filt_type, avbl_space);
}

/**
 * Callback invoked when scan param has been added, cleared, or deleted
 */
void gatt_client_scan_filter_param_callback(int action,
                                            int client_if,
                                            int status,
                                            int avbl_space) {
  Tracer trc("gatt_client_scan_filter_param_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitScanFilterParamSetup);

  ALOGV("gatt_client_scan_filter_param_callback: action=%d client_if=%d "
        "status=%d avbl_space=%d",
        action, client_if, status, avbl_space);
}

/**
 * Callback invoked when a scan filter configuration command has completed
 */
void gatt_client_scan_filter_status_callback(int enable,
                                             int client_if,
                                             int status) {
  Tracer trc("gatt_client_scan_filter_status_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitScanFilterEnable);

  ALOGV("gatt_client_scan_filter_status_callback: enable=%d client_if=%d "
        "status=%d",
        enable, client_if, status);
}

/**
 * Callback invoked when multi-adv enable operation has completed
 */
void gatt_client_multi_adv_enable_callback(int client_if, int status) {
  Tracer trc("gatt_client_multi_adv_enable_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitAdvertiseEnable);

  ALOGV("gatt_client_multi_adv_enable_callback: client_if=%d status=%d",
        client_if,
        status);

  status_during_advertise = status;

  if (status) {
    if (client_if == gatt_client_listen_scan_if) {
      bledroid.sendEvent("!advertisingStart %d", status);
    } else if (client_if == gatt_client_beacon_if) {
      bledroid.sendEvent("!beaconStart %d", status);
    }
  }
}

/**
 * Callback invoked when multi-adv param update operation has completed
 */
void gatt_client_multi_adv_update_callback(int client_if, int status) {
  Tracer trc("gatt_client_multi_adv_update_callback");
  ALOGE("gatt_client_multi_adv_update_callback: client_if=%d status=%d",
        client_if,
        status);
}

/**
 * Callback invoked when multi-adv instance data set operation has completed
 */
void gatt_client_multi_adv_data_callback(int client_if, int status) {
  Tracer trc("gatt_client_multi_adv_data_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitAdvertiseData);

  ALOGV("gatt_client_multi_adv_data_callback: client_if=%d status=%d",
        client_if,
        status);

  status_during_advertise = status;

  if (client_if == gatt_client_listen_scan_if) {
    bledroid.sendEvent("!advertisingStart %d", status);
  } else if (client_if == gatt_client_beacon_if) {
    bledroid.sendEvent("!beaconStart %d", status);
  }
}

/**
 * Callback invoked when multi-adv disable operation has completed
 */
void gatt_client_multi_adv_disable_callback(int client_if, int status) {
  Tracer trc("gatt_client_multi_adv_disable_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitAdvertiseDisable);

  ALOGV("gatt_client_multi_adv_disable_callback: client_if=%d status=%d",
        client_if,
        status);

  status_during_advertise = status;

  if (client_if == gatt_client_listen_scan_if) {
    bledroid.sendEvent("!advertisingStop %d", status);
  } else if (client_if == gatt_client_beacon_if) {
    bledroid.sendEvent("!beaconStop %d", status);
  }
}

void gatt_client_congestion_callback(int conn_id, bool congested) {
  Tracer trc("gatt_client_congestion_callback");
  ALOGV("gatt_client_congestion_callback: conn_id=%d congested=%s",
        conn_id,
        congested ? "true" : "false");
}

#ifdef TARGET_GE_MARSHMALLOW
void gatt_scan_parameter_setup_completed_callback(int client_if,
                                                  btgattc_error_t status) {
  Tracer trc("gatt_scan_parameter_setup_completed_callback");
  ALOGV("gatt_scan_parameter_setup_completed_callback: client_if=%d status=%d",
        client_if, status);
}
#endif

btgatt_client_callbacks_t bt_gatt_client_callbacks = {
  gatt_register_client_callback,
  gatt_client_scan_result_callback,
  gatt_client_connect_callback,
  gatt_client_disconnect_callback,
  gatt_client_search_complete_callback,
  gatt_client_search_result_callback,
  gatt_client_get_characteristic_callback,
  gatt_client_get_descriptor_callback,
  gatt_client_get_included_service_callback,
  gatt_client_register_for_notification_callback,
  gatt_client_notify_callback,
  gatt_client_read_characteristic_callback,
  gatt_client_write_characteristic_callback,
  gatt_client_read_descriptor_callback,
  gatt_client_write_descriptor_callback,
  NULL, // execute_write_callback
  gatt_client_read_remote_rssi_callback,
  gatt_client_listen_callback,
  gatt_client_configure_mtu_callback,
  gatt_client_scan_filter_cfg_callback,
  gatt_client_scan_filter_param_callback,
  gatt_client_scan_filter_status_callback,
  gatt_client_multi_adv_enable_callback,
  gatt_client_multi_adv_update_callback,
  gatt_client_multi_adv_data_callback,
  gatt_client_multi_adv_disable_callback,
  gatt_client_congestion_callback,
  NULL, // batchscan_cfg_storage_callback
  NULL, // batchscan_enable_disable_callback
  NULL, // batchscan_reports_callback
  NULL, // batchscan_threshold_callback
  NULL  // track_adv_event_callback
#ifdef TARGET_GE_MARSHMALLOW
 ,gatt_scan_parameter_setup_completed_callback
#endif
};


//
// btgatt_server_callbacks_t
//

void gatt_server_register_server_callback(int status,
                                          int server_if,
                                          bt_uuid_t * /* app_uuid */) {
  Tracer trc("gatt_server_register_server_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitRegisterServer);

  if (status != 0) {
    ALOGE("register_server failed. error=%d", status);
    abort();
  }

  ALOGV("gatt_server_register_server_callback. status=%d server_if=%d",
        status,
        server_if);

  gatt_server_if = server_if;
}

/**
 * Callback indicating that a remote device has connected or been disconnected
 */
void gatt_server_connection_callback(int conn_id,
                                     int server_if,
                                     int connected,
                                     bt_bdaddr_t *bda) {
  Tracer trc("gatt_server_connection_callback");

  if (!bda) {
    ALOGE("gatt_server_connection_callback. NULL bda?");
    return;
  }

  auto signal = mainThreadWaiter.autoSignal(WaitServerDisconnect,
                                            !connected,
                                            false);

  ALOGV("gatt_server_connection_callback. conn_id=%d server_if=%d connected=%d",
        conn_id,
        server_if,
        connected);

  bledroid.sendEvent("!server%sonnect %02X:%02X:%02X:%02X:%02X:%02X %d",
    connected ? "C" : "Disc",
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5],
    conn_id
  );
}

/**
 * Callback invoked in response to create_service
 */
void gatt_server_service_added_callback(int status,
                                        int server_if,
                                        btgatt_srvc_id_t * /* srvc_id */,
                                        int handle) {
  Tracer trc("gatt_server_service_added_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitAddService);

  ALOGV("gatt_server_service_added_callback: status=%d server_if=%d handle=%d",
        status,
        server_if,
        handle);

  if (status) {
    ALOGE("gatt_server_service_added_callback failed status=%d", status);
    handle = 0;
  }
  bledroid.sendEvent("!serviceAdded %d %d", status, handle);
}

/**
 * Callback indicating that an included service has been added to a service
 */
void gatt_server_included_service_added_callback(int status,
                                                 int server_if,
                                                 int srvc_handle,
                                                 int incl_srvc_handle) {
  Tracer trc("gatt_server_included_service_added_callback");
  ALOGV("gatt_server_included_service_added_callback");
}

/**
 * Callback invoked when a characteristic has been added to a service
 */
void gatt_server_characteristic_added_callback(int status,
                                               int server_if,
                                               bt_uuid_t * /* uuid */,
                                               int srvc_handle,
                                               int char_handle) {
  Tracer trc("gatt_server_characteristic_added_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitAddCharacteristic);

  ALOGV("gatt_server_characteristic_added_callback. status=%d server_if=%d "
        "srvc_handle=%d char_handle=%d",
        status,
        server_if,
        srvc_handle,
        char_handle);

  bledroid.sendEvent("!attributeAdded %d %d", status, char_handle);
}

/**
 * Callback invoked when a descriptor has been added to a characteristic
 */
void gatt_server_descriptor_added_callback(int status,
                                           int server_if,
                                           bt_uuid_t *uuid,
                                           int srvc_handle,
                                           int descr_handle) {
  Tracer trc("gatt_server_descriptor_added_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitAddDescriptor);

  ALOGV("gatt_server_descriptor_added_callback. status=%d server_if=%d "
        "srvc_handle=%d descr_handle=%d",
        status,
        server_if,
        srvc_handle,
        descr_handle);

  bledroid.sendEvent("!attributeAdded %d %d", status, descr_handle);
}

/**
 * Callback invoked in response to start_service
 */
void gatt_server_service_started_callback(int status,
                                          int server_if,
                                          int srvc_handle) {
  Tracer trc("gatt_server_service_started_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitStartService);

  ALOGV("gatt_server_service_started_callback: status=%d server_if=%d "
        "srvc_handle=%d",
        status,
        server_if,
        srvc_handle);

  bledroid.sendEvent("!serviceStarted %d", status);
}

/**
 * Callback invoked in response to stop_service
 */
void gatt_server_service_stopped_callback(int status,
                                          int server_if,
                                          int srvc_handle) {
  Tracer trc("gatt_server_service_stopped_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitStopService);

  ALOGV("gatt_server_service_stopped_callback: status=%d server_if=%d "
        "srvc_handle=%d",
        status,
        server_if,
        srvc_handle);

  bledroid.sendEvent("!serviceStopped %d", status);
}

/**
 * Callback triggered when a service has been deleted
 */
void gatt_server_service_deleted_callback(int status,
                                          int server_if,
                                          int srvc_handle) {
  Tracer trc("gatt_server_service_deleted_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitDeleteService);

  ALOGV("gatt_server_service_deleted_callback: status=%d server_if=%d "
        "srvc_handle=%d",
        status,
        server_if,
        srvc_handle);

  bledroid.sendEvent("!serviceDeleted %d", status);
}

/**
 * Callback invoked when a remote device has requested to read a characteristic
 * or descriptor. The application must respond by calling send_response
 */
void gatt_server_request_read_callback(int conn_id,
                                       int trans_id,
                                       bt_bdaddr_t *bda,
                                       int attr_handle,
                                       int offset,
                                       bool is_long) {
  Tracer trc("gatt_server_request_read_callback");
  ALOGV("gatt_server_request_read_callback: conn_id=%d trans_id=%d "
        "attr_handle=%d offset=%d is_long=%d",
        conn_id,
        trans_id,
        attr_handle,
        offset,
        is_long);

  bledroid.sendEvent("!readAttribute %d %d %02X:%02X:%02X:%02X:%02X:%02X %d %d "
                     "%u",
                     conn_id,
                     trans_id,
                     bda->address[0],
                     bda->address[1],
                     bda->address[2],
                     bda->address[3],
                     bda->address[4],
                     bda->address[5],
                     attr_handle,
                     offset,
                     is_long ? 1 : 0);
}

/**
 * Callback invoked when a remote device has requested to write to a
 * characteristic or descriptor.
 */
void gatt_server_request_write_callback(int conn_id,
                                        int trans_id,
                                        bt_bdaddr_t *bda,
                                        int attr_handle,
                                        int offset,
                                        int length,
                                        bool need_rsp,
                                        bool is_prep,
                                        uint8_t* value) {
  Tracer trc("gatt_server_request_write_callback");

  ALOGV("gatt_server_request_write_callback conn_id=%d trans_id=%d "
        "attr_handle=%d offset=%d length=%d need_rsp=%d is_prep=%d value[0]=%d",
        conn_id,
        trans_id,
        attr_handle,
        offset,
        length,
        need_rsp,
        is_prep,
        *value);

  if (length >= BTGATT_MAX_ATTR_LEN) {
    ALOGE("Invalid attribute length");
    return;
  }

  constexpr size_t kMaxCharacteristicLength = (MAX_MSG_SIZE - 60) / 2;

  if (size_t(length) >= kMaxCharacteristicLength) {
    ALOGE("Attribute length too long for our message size");
    return;
  }

  char msg[kMaxCharacteristicLength + 1];
  int written = snprintf(msg,
                         sizeof(msg),
                         "!writeAttribute %d %d %02X:%02X:%02X:%02X:%02X:%02X "
                         "%d %d %u %u ",
                         conn_id,
                         trans_id,
                         bda->address[0],
                         bda->address[1],
                         bda->address[2],
                         bda->address[3],
                         bda->address[4],
                         bda->address[5],
                         attr_handle,
                         offset,
                         need_rsp ? 1 : 0,
                         is_prep ? 1 : 0);
  if (written < 0 || written > int(sizeof(msg))) {
    ALOGE("Failed to encode");
    return;
  }

  char *p = msg + written;
  for (int i = 0; i < length; i++) {
    sprintf(p, "%02x", value[i]);
    p += 2;
  }
  *p = '\0';

#ifdef DEBUG
  if (strlen(msg) >= sizeof(msg)) {
    abort();  // BUG!
  }
#endif

  bledroid.sendEvent(msg);
}

/**
 * Callback invoked when a previously prepared write is to be executed
 */
void gatt_server_request_exec_write_callback(int conn_id, int trans_id,
    bt_bdaddr_t *bda, int exec_write) {
  Tracer trc("gatt_server_request_exec_write_callback");
  ALOGE("gatt_server_request_exec_write_callback");
}

/**
 * Callback triggered in response to send_response if the remote device
 * sends a confirmation.
 */
void gatt_server_response_confirmation_callback(int status, int handle) {
  Tracer trc("gatt_server_response_confirmation_callback");
  ALOGD("gatt_server_response_confirmation_callback: status=%d handle=%d",
      status, handle);
}

/**
 * Callback confirming that a notification or indication has been sent
 * to a remote device.
 */
void gatt_server_indication_sent_callback(int conn_id, int status) {
  Tracer trc("gatt_server_indication_sent_callback");
  auto signal = mainThreadWaiter.autoSignal(WaitNotify);

  ALOGV("gatt_server_indication_sent_callback: conn_id=%d status=%d",
        conn_id,
        status);

  bledroid.sendEvent("!notifySent %d %d", conn_id, status);
}

/**
 * Callback notifying an application that a remote device connection is
 * currently congested and cannot receive any more data. An application should
 * avoid sending more data until a further callback is received indicating the
 * congestion status has been cleared.
 */
void gatt_server_congestion_callback(int conn_id, bool congested) {
  Tracer trc("gatt_server_congestion_callback");
  ALOGE("gatt_server_congestion_callback");
}

/**
 * Callback invoked when the MTU for a given connection changes
 */
void gatt_server_mtu_changed_callback(int conn_id, int mtu) {
  Tracer trc("gatt_server_mtu_changed_callback");
  ALOGD("gatt_server_mtu_changed_callback: conn_id=%d mtu=%d",
        conn_id, mtu);
  bledroid.sendEvent("!mtuChange %d %d", conn_id, mtu);
}

btgatt_server_callbacks_t bt_gatt_server_callbacks = {
    gatt_server_register_server_callback,
    gatt_server_connection_callback,
    gatt_server_service_added_callback,
    gatt_server_included_service_added_callback,
    gatt_server_characteristic_added_callback,
    gatt_server_descriptor_added_callback,
    gatt_server_service_started_callback,
    gatt_server_service_stopped_callback,
    gatt_server_service_deleted_callback,
    gatt_server_request_read_callback,
    gatt_server_request_write_callback,
    gatt_server_request_exec_write_callback,
    gatt_server_response_confirmation_callback,
    gatt_server_indication_sent_callback,
    gatt_server_congestion_callback,
#ifdef BLUETOOTH_GATT_SERVER_MTU_CHANGED_CALLBACK
    gatt_server_mtu_changed_callback,
#endif
};

btgatt_callbacks_t gatt_callbacks = {
  .size = sizeof(btgatt_callbacks_t),
  .client = &bt_gatt_client_callbacks,
  .server = &bt_gatt_server_callbacks
};

int bt_convert_args(char *&saveptr, int &connectionId) {
  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no connectionId)");

  connectionId = atoi(token);

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr, btgatt_srvc_id_t &service) {
  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no service string)");
  LOG_ERROR(!str_to_uuid(token, service.id.uuid),
            "Could not convert service string");

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no service instanceId string)");

  service.id.inst_id = atoi(token);

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no service isPrimary string)");

  service.is_primary = atoi(token) ? 1 : 0;

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr, btgatt_gatt_id_t &characteristic) {
  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no characteristic string)");
  LOG_ERROR(!str_to_uuid(token, characteristic.uuid),
            "Could not convert characteristic string");

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no characteristic instanceId string)");

  characteristic.inst_id = atoi(token);

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr,
                    int &connectionId,
                    btgatt_srvc_id_t &service) {
  int err = bt_convert_args(saveptr, connectionId);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  err = bt_convert_args(saveptr, service);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr,
                    int &connectionId,
                    btgatt_srvc_id_t &service,
                    btgatt_gatt_id_t &characteristic) {
  int err = bt_convert_args(saveptr, connectionId, service);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  err = bt_convert_args(saveptr, characteristic);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr,
                    int &connectionId,
                    btgatt_srvc_id_t &service,
                    btgatt_gatt_id_t &characteristic,
                    int &authenticationRequested) {
  int err = bt_convert_args(saveptr, connectionId, service, characteristic);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no authentication string)");

  authenticationRequested = atoi(token);

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr,
                    int &connectionId,
                    btgatt_srvc_id_t &service,
                    btgatt_gatt_id_t &characteristic,
                    btgatt_gatt_id_t &descriptor,
                    int &authenticationRequested) {
  int err = bt_convert_args(saveptr, connectionId, service, characteristic);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  err = bt_convert_args(saveptr, descriptor);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no authentication string)");

  authenticationRequested = atoi(token);

  return BT_STATUS_SUCCESS;
}

int bt_convert_args(char *&saveptr,
                    btgatt_srvc_id_t &service,
                    btgatt_gatt_id_t &characteristic) {
  int err = bt_convert_args(saveptr, service);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  err = bt_convert_args(saveptr, characteristic);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  return BT_STATUS_SUCCESS;
}
/**
 *
 */
void bt_cleanup() {
  Tracer trc("bt_cleanup");
  ALOGV("bt cleanup");

  if (advertising && bt_stop_advertising() != BT_STATUS_SUCCESS) {
    ALOGW("stop advertising failed");
  }

  if (beaconActive && bt_stop_beacon() != BT_STATUS_SUCCESS) {
    ALOGW("stop beacon failed");
  }

  if (gatt) {
    if (gatt_server_if != -1 &&
        gatt->server->unregister_server(gatt_server_if) != BT_STATUS_SUCCESS) {
      ALOGW("unregister_server failed");
    }
    if (gatt_client_listen_scan_if != -1 &&
        gatt->client->unregister_client(gatt_client_listen_scan_if) !=
          BT_STATUS_SUCCESS) {
      ALOGW("unregister_client scan_listen failed");
    }
    if (gatt_client_beacon_if != -1 &&
        gatt->client->unregister_client(gatt_client_beacon_if) !=
          BT_STATUS_SUCCESS) {
      ALOGW("unregister_client beacon failed");
    }
    gatt->cleanup();
  }

  if (device) {
    const bluetooth_device_t *bt_device = (bluetooth_device_t *) device;
    const bt_interface_t *bt = bt_device->get_bluetooth_interface();
    if (bt) {
      {
        auto lock = mainThreadWaiter.autoLock();
        if (bt->disable() == BT_STATUS_SUCCESS) {
          mainThreadWaiter.wait(WaitEnableDisable);
          if (adapter_state != BT_STATE_OFF) {
            ALOGE("failed to disable BT");
          }
        } else {
          ALOGE("bt->disable() failed");
        }
      }
      bt->cleanup();
    } else {
      ALOGE("bt_device->get_bluetooth_interface failed");
    }
    device->close(device);
  }

  adapter_state = BT_STATE_OFF;
  gatt_server_if = -1;
  gatt_client_listen_scan_if = -1;
  gatt_client_beacon_if = -1;
  desired_listen_state = false;
  gatt_client_scanning = false;
  gatt = nullptr;
  device = nullptr;
  connection_id_during_register_for_notification = -1;
  address_during_rssi_update = kInvalidAddr;
  gatt_client_connection_count = 0;
  advertising = false;
  beaconActive = false;
}

/**
 * Initialize bluetooth subsystem
 */
int bt_init() {
  Tracer trc("bt_init");

  // Cleanup BT if we're part-way initialized already
  bt_cleanup();

  char board_platform[PROPERTY_VALUE_MAX] = {0};
  property_get("ro.board.platform", board_platform, NULL);
  // On Kenzo, initializing Bluetooth before Wifi causes the wifi firmware
  // to not load.  Work around this for now by requiring that wifi always be
  // initialized first.  Normally silk-bledroid.js should wait for wifi before
  // triggering bt_init(), but we ever somehow get this far without wifi
  // initialized regardless then just refuse to continue.
  if (!strcmp(board_platform, "msm8952")) {
    char wlan_status[PROPERTY_VALUE_MAX] = {0};
    property_get("wlan.driver.status", wlan_status, NULL);
    if (0 != strcmp(wlan_status, "ok")) {
      ALOGE("wlan driver status not ok.  Initialize wifi first: %s", wlan_status);
      return 1;
    }
  }

  const hw_module_t *module;
  int err = hw_get_module(BT_HARDWARE_MODULE_ID, &module);
  LOG_ERROR(err, "hw_get_module for " BT_HARDWARE_MODULE_ID " failed: %d", err);

  ALOGV("id: %s", module->id);
  ALOGV("name: %s", module->name);
  ALOGV("author: %s", module->author);

  err = module->methods->open(module, BT_HARDWARE_MODULE_ID, &device);
  LOG_ERROR(err, BT_HARDWARE_MODULE_ID " open failed: %d", err);

  const bluetooth_device_t *bt_device = (bluetooth_device_t *) device;
  const bt_interface_t *bt = bt_device->get_bluetooth_interface();
  LOG_ERROR(!bt, "bt_device->get_bluetooth_interface failed");
  LOG_ERROR((bt->size != sizeof(*bt)), "bt size incorrect, bluetooth.h mismatch?. "
        "Expected %d, got %d", sizeof(*bt), bt->size);

  ALOGV("bt init");
  err = bt->init(&bt_callbacks);
  LOG_ERROR(err, "bt init() failed: %d", err);

  err = bt->set_os_callouts(&os_callouts);
  LOG_ERROR(err, "bt set_os_callouts() failed: %d", err);

  ALOGV("bt enable");
#ifdef AOSPBLUETOOTH_SUPPORTS_GUEST_MODE
  CALL_AND_WAIT(bt->enable(/*guest_mode=*/false), WaitEnableDisable);
#else
  CALL_AND_WAIT(bt->enable(), WaitEnableDisable);
#endif
  LOG_ERROR((adapter_state != BT_STATE_ON), "failed to turn on BT");

  char name[PROPERTY_VALUE_MAX] = {0};
  property_get("ro.silk.bt.name", name, "Silk");
  ALOGV("Using bluetooth adapter name '%s'", name);

  const int name_len = int(strlen(name));
  LOG_ERROR(!name_len, "Empty bluetooth adapter name");

  bt_property_t name_prop = {
    .type = BT_PROPERTY_BDNAME,
    .len = name_len,
    .val = name,
  };
  err = bt->set_adapter_property(&name_prop);
  LOG_ERROR(err, "bt set_adapter_property(BT_PROPERTY_BDNAME) failed: %d", err);

  gatt = static_cast<btgatt_interface_t const *>(bt->get_profile_interface(
      BT_PROFILE_GATT_ID));
  LOG_ERROR(!gatt, "Unable to get " BT_PROFILE_GATT_ID);

  err = gatt->init(&gatt_callbacks);
  LOG_ERROR(err, "gatt init() failed: %d", err);

  auto *serverUuid = const_cast<bt_uuid_t *>(&kServerUuid);
  CALL_AND_WAIT(gatt->server->register_server(serverUuid), WaitRegisterServer);
  LOG_ERROR(gatt_server_if == -1, "Failed to register gatt server");

  auto *listenScanUuid = const_cast<bt_uuid_t *>(&kClientListenScanUuid);
  CALL_AND_WAIT(gatt->client->register_client(listenScanUuid),
                                              WaitRegisterClient);
  LOG_ERROR(gatt_client_listen_scan_if == -1,
            "Failed to register listen/scan client");

  auto *beaconUuid = const_cast<bt_uuid_t *>(&kClientBeaconUuid);
  CALL_AND_WAIT(gatt->client->register_client(beaconUuid),
                WaitRegisterClient);
  LOG_ERROR(gatt_client_beacon_if == -1,
            "Failed to register beacon client");

  return BT_STATUS_SUCCESS;
}

int bt_start_advertising(char *&saveptr) {
  char manufacturer_buffer[31];
  char service_data_buffer[31];

  const char *token = strtok_r(nullptr, " ", &saveptr);
  LOG_ERROR(!token, "No include_name");
  LOG_ERROR(*token != '0' && *token != '1', "Invalid include_name");
  const bool include_name = *token == '1';

  token = strtok_r(nullptr, " ", &saveptr);
  LOG_ERROR(!token, "No include_txpower");
  LOG_ERROR(*token != '0' && *token != '1', "Invalid include_txpower");
  const bool include_txpower = *token == '1';

  token = strtok_r(nullptr, " ", &saveptr);
  LOG_ERROR(!token, "No appearance");
  const int appearance = atoi(token);

  token = strtok_r(nullptr, " ", &saveptr);
  LOG_ERROR(!token, "No manufacturer_len");
  const int manufacturer_len = atoi(token);
  LOG_ERROR(manufacturer_len < 0 ||
            size_t(manufacturer_len) > sizeof(manufacturer_buffer),
            "Invalid manufacturer_len");

  char *manufacturer_data = nullptr;
  if (manufacturer_len) {
    token = strtok_r(nullptr, " ", &saveptr);
    LOG_ERROR(!hexstr_to_buffer(token, manufacturer_buffer, manufacturer_len),
              "Couldn't convert manufacturer_data");
    manufacturer_data = manufacturer_buffer;
  }

  token = strtok_r(nullptr, " ", &saveptr);
  LOG_ERROR(!token, "No service_data_len");
  const int service_data_len = atoi(token);
  LOG_ERROR(service_data_len < 0 ||
            size_t(service_data_len) > sizeof(service_data_buffer),
            "Invalid service_data_len");

  char *service_data = nullptr;
  if (service_data_len) {
    token = strtok_r(nullptr, " ", &saveptr);
    LOG_ERROR(!hexstr_to_buffer(token, service_data_buffer, service_data_len),
              "Couldn't convert service_data");
    service_data = service_data_buffer;
  }

  int service_uuid_count;
  std::auto_ptr<bt_uuid_t> service_uuids;
  LOG_ERROR(str_to_uuids(saveptr, service_uuid_count, service_uuids),
            "Failed to convert string of uuids");

  const int service_uuid_len = service_uuid_count * sizeof(*(service_uuids.get()));
  auto* service_uuid = reinterpret_cast<char*>(service_uuids.get());

  static const int kMinInterval = AdvertiseModeBalanced;
  static const int kMaxInterval = kMinInterval + AdvertiseIntervalDeltaUnit;
  static const int kAdvertiseEventType = AdvertiseEventTypeConnectable;
  static const int kAdvertiseChannel = AdvertiseChannelAll;
  static const int kTxPowerLevel = TransactionPowerLevelMed;
  static const int kTimeoutSec = 0;

  // TODO: We can add support for this later.
  static const bool kSetScanResponse = false;

  if (adapter_supports_multi_adv) {
    if (!advertising) {
      status_during_advertise = 0;

      CALL_AND_WAIT(gatt->client->multi_adv_enable(
                      gatt_client_listen_scan_if,
                      kMinInterval,
                      kMaxInterval,
                      kAdvertiseEventType,
                      kAdvertiseChannel,
                      kTxPowerLevel,
                      kTimeoutSec),
                    WaitAdvertiseEnable);

      LOG_ERROR(status_during_advertise != 0, "multi_adv_enable failed");

      advertising = true;
    }

    status_during_advertise = 0;

    CALL_AND_WAIT(gatt->client->multi_adv_set_inst_data(
                    gatt_client_listen_scan_if,
                    kSetScanResponse,
                    include_name,
                    include_txpower,
                    appearance,
                    manufacturer_len,
                    manufacturer_data,
                    service_data_len,
                    service_data,
                    service_uuid_len,
                    service_uuid),
                  WaitAdvertiseData);

    LOG_ERROR(status_during_advertise != 0, "multi_adv_set_inst_data failed");
  } else {
    if (!advertising) {
      desired_listen_state = true;
      status_during_advertise = 0;

      CALL_AND_WAIT(gatt->client->listen(gatt_client_listen_scan_if,
                                         desired_listen_state),
                    WaitListen);

      LOG_ERROR(status_during_advertise != 0, "listen failed");

      advertising = true;
    }

    // XXX Figure out how to wait for this?
    int err = gatt->client->set_adv_data(gatt_client_listen_scan_if,
                                         kSetScanResponse,
                                         include_name,
                                         include_txpower,
                                         0, // min_interval
                                         0, // max_interval
                                         appearance,
                                         manufacturer_len,
                                         manufacturer_data,
                                         service_data_len,
                                         service_data,
                                         service_uuid_len,
                                         service_uuid);
    LOG_ERROR(err, "gatt client set_adv_data failed: %d", err);
  }

  return BT_STATUS_SUCCESS;
}

int bt_stop_advertising() {
  if (!advertising) {
    return BT_STATUS_SUCCESS;
  }

  if (adapter_supports_multi_adv) {
    status_during_advertise = 0;

    CALL_AND_WAIT(gatt->client->multi_adv_disable(gatt_client_listen_scan_if),
                  WaitAdvertiseDisable);

    LOG_ERROR(status_during_advertise != 0, "multi_adv_disable failed");
  } else {
    desired_listen_state = false;
    status_during_advertise = 0;

    CALL_AND_WAIT(gatt->client->listen(gatt_client_listen_scan_if,
                                       desired_listen_state),
                  WaitListen);

    LOG_ERROR(status_during_advertise != 0, "listen failed");
  }

  advertising = false;

  return BT_STATUS_SUCCESS;
}

int bt_start_beacon(char *&saveptr) {
  LOG_ERROR(!adapter_supports_multi_adv, "startBeacon not supported");

  char *data_str = strtok_r(nullptr, " ", &saveptr);
  LOG_ERROR(!data_str, "No beacon data");

  const int data_len = strlen(data_str);
  LOG_ERROR(data_len != 50, "Expected exactly 50 chars");

  char data[25];
  LOG_ERROR(!hexstr_to_buffer(data_str, data, sizeof(data)),
            "Couldn't convert data");

  static const int kMinInterval = AdvertiseModeBalanced;
  static const int kMaxInterval = kMinInterval + AdvertiseIntervalDeltaUnit;
  static const int kAdvertiseEventType = AdvertiseEventTypeNonConnectable;
  static const int kAdvertiseChannel = AdvertiseChannelAll;
  static const int kTxPowerLevel = TransactionPowerLevelMed;
  static const int kTimeoutSec = 0;

  if (!beaconActive) {
    status_during_advertise = 0;

    CALL_AND_WAIT(gatt->client->multi_adv_enable(
                    gatt_client_beacon_if,
                    kMinInterval,
                    kMaxInterval,
                    kAdvertiseEventType,
                    kAdvertiseChannel,
                    kTxPowerLevel,
                    kTimeoutSec),
                  WaitAdvertiseEnable);

    LOG_ERROR(status_during_advertise != 0, "multi_adv_enable failed");

    beaconActive = true;
  }

  static const bool kSetScanResponse = false;
  static const bool kIncludeName = false;
  static const bool kIncludeTxPower = false;
  static const int kAppearance = 0;
  static const int kServiceDataLength = 0;
  static char* const kServiceData = nullptr;
  static const int kServiceUuidsLength = 0;
  static char* const kServiceUuids = nullptr;

  status_during_advertise = 0;

  CALL_AND_WAIT(gatt->client->multi_adv_set_inst_data(
                  gatt_client_beacon_if,
                  kSetScanResponse,
                  kIncludeName,
                  kIncludeTxPower,
                  kAppearance,
                  sizeof(data),
                  data,
                  kServiceDataLength,
                  kServiceData,
                  kServiceUuidsLength,
                  kServiceUuids),
                WaitAdvertiseData);

  LOG_ERROR(status_during_advertise != 0, "multi_adv_set_inst_data failed");

  return BT_STATUS_SUCCESS;
}

int bt_stop_beacon() {
  if (!beaconActive) {
    return BT_STATUS_SUCCESS;
  }

  status_during_advertise = 0;

  CALL_AND_WAIT(gatt->client->multi_adv_disable(gatt_client_beacon_if),
                WaitAdvertiseDisable);

  LOG_ERROR(status_during_advertise != 0, "multi_adv_disable failed");

  beaconActive = false;

  return BT_STATUS_SUCCESS;
}

int bt_start_scan(char *&saveptr) {
  const char *allowDuplicatesStr = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!allowDuplicatesStr, "Malformed startScanning (no duplicates)");
  LOG_ERROR(*allowDuplicatesStr != '0' && *allowDuplicatesStr != '1',
            "Malformed startScanning (duplicates not 0 or 1)");
  const bool allowDuplicates = *allowDuplicatesStr == '0' ? false : true;

  int numServices;
  std::auto_ptr<bt_uuid_t> service_uuids;
  LOG_ERROR(str_to_uuids(saveptr, numServices, service_uuids),
            "Failed to convert string of uuids");

  int err;

  if (gatt_client_scanning) {
    // XXX Figure out how to wait for this? Maybe switch to batchscan API.
    err = gatt->client->scan(false);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to cancel previous scan");

    gatt_client_scanning = false;
    ALOGD("Scanning stopped");
  }

  // This only needs to be done once, I think.
  static bool scanFilterSetup = false;
  if (!scanFilterSetup) {
    err = gatt->client->set_scan_parameters(
#ifdef TARGET_GE_MARSHMALLOW
      gatt_client_listen_scan_if,
#endif
      kScanModeWindow,
      kScanModeInterval
    );
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to set scan parameters");

    CALL_AND_WAIT(gatt->client->scan_filter_enable(gatt_client_listen_scan_if,
                                                   true),
                  WaitScanFilterEnable);

    static const int kFilterLogicType = 1;

#ifdef TARGET_GE_MARSHMALLOW
#pragma message "TODO: These params need to be inspected for accuracy"
    static const uint16_t kListLogicType = 0x1111;
    static const int kRssiThreshold = 0x80; // -127, :scream_cat:

    btgatt_filt_param_setup_t filter_parms = {
      static_cast<uint8_t>(gatt_client_listen_scan_if),
      ScanFilterActionAdd,
      kScanFilterIndex,
      ScanFeatureSelectionAllPass,
      kListLogicType,
      kFilterLogicType,
      kRssiThreshold,
      kRssiThreshold,
      ScanDeliveryModeImmediate,
      kScanLostFoundTimeout,
      kScanLostFoundTimeout,
      kScanFoundSightings,
      1,
    };
    CALL_AND_WAIT(
      gatt->client->scan_filter_param_setup(filter_parms),
      WaitScanFilterParamSetup);
#else
    static const int kListLogicType = 0x1111111;
    static const int kRssiThreshold = -127;
    CALL_AND_WAIT(
      gatt->client->scan_filter_param_setup(gatt_client_listen_scan_if,
                                            ScanFilterActionAdd,
                                            kScanFilterIndex,
                                            ScanFeatureSelectionAllPass,
                                            kListLogicType,
                                            kFilterLogicType,
                                            kRssiThreshold,
                                            kRssiThreshold,
                                            ScanDeliveryModeImmediate,
                                            kScanLostFoundTimeout,
                                            kScanLostFoundTimeout,
                                            kScanFoundSightings),
      WaitScanFilterParamSetup);
#endif
    scanFilterSetup = true;
  }

  if (numServices) {
    for (int index = 0; index < numServices; index++) {
      const bt_uuid_t& uuid = service_uuids.get()[index];

      static const int companyId = 0;
      static const int companyIdMask = 0;
      static const bt_uuid_t* uuid_mask = NULL;
      static const bt_bdaddr_t *bdAddress = NULL;
      static const char addressType = 0;
      static const int dataLength = 0;
      static const char *data = NULL;
      static const int maskLength = 0;
      static const char *mask = NULL;

      ALOGV("Adding service filter\n");
      CALL_AND_WAIT(
        gatt->client->scan_filter_add_remove(gatt_client_listen_scan_if,
                                             ScanFilterActionAdd,
                                             ScanFilterTypeServiceUUID,
                                             kScanFilterIndex,
                                             companyId,
                                             companyIdMask,
                                             &uuid,
                                             uuid_mask,
                                             bdAddress,
                                             addressType,
                                             dataLength,
                                             const_cast<char *>(data),
                                             maskLength,
                                             const_cast<char *>(mask)),
        WaitScanFilterConfig);
      ALOGV("Added service UUID filter: "
            "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x\n",
            uuid.uu[15], uuid.uu[14], uuid.uu[13], uuid.uu[12],
            uuid.uu[11], uuid.uu[10], uuid.uu[9], uuid.uu[8],
            uuid.uu[7], uuid.uu[6], uuid.uu[5], uuid.uu[4],
            uuid.uu[3], uuid.uu[2], uuid.uu[1], uuid.uu[0]);
    }
  } else {
    CALL_AND_WAIT(gatt->client->scan_filter_clear(gatt_client_listen_scan_if,
                                                  kScanFilterIndex),
                  WaitScanFilterConfig);
  }

  // Start scan.
  // XXX Figure out how to wait for this? Maybe switch to batchscan API.
  err = gatt->client->scan(true);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to cancel previous scan");

  gatt_client_scanning = true;
  ALOGD("Scanning started");

  return BT_STATUS_SUCCESS;
}

int bt_connect(char *&saveptr) {
  char *addrString = strtok_r(NULL, " \n", &saveptr);
  bt_bdaddr_t addr;
  LOG_ERROR(!str_to_addr(addrString, addr),
            "Malformed connect (bad address)");

  bt_uuid_t uuid;
  generate_uuid(uuid);

  {
    auto lock = mainThreadWaiter.autoLock();

    client_if_during_connect = -1;
    uuid_during_connect = uuid;

    int err = gatt->client->register_client(&uuid);
    if (err != BT_STATUS_SUCCESS) {
      ALOGE("register_client failed: %d", err);
      return err;
    }

    mainThreadWaiter.wait(WaitRegisterClient);

    if (client_if_during_connect == -1) {
      ALOGE("register_client failed to set client_if");
      return BT_STATUS_FAIL;
    }

    // Make sure we didn't just get handed an interface id that we were going
    // to unregister.
    if (disconnected_if_list_busy) {
      bool additionalUnregister = false;
      for (size_t index = 0; index < disconnected_if_list_count; index++) {
        if (disconnected_if_list[index] == client_if_during_connect) {
          disconnected_if_list[index] = -1;
        } else {
          additionalUnregister = true;
        }
      }
      if (!additionalUnregister) {
        disconnected_if_list_busy = false;
      }
    }
  }

  if (gatt->client->refresh(client_if_during_connect, &addr) !=
      BT_STATUS_SUCCESS) {
    ALOGE("refresh failed");
  }

  const bool isDirect = true;

  connect_failed = true;
  CALL_AND_WAIT_NO_RETURN(gatt->client->connect(client_if_during_connect,
                                                &addr,
                                                isDirect,
                                                ConnectTransportLE),
                          WaitConnect);

  if (connect_failed) {
    ALOGV("connect failed");

    if (gatt->client->unregister_client(client_if_during_connect) !=
        BT_STATUS_SUCCESS) {
      ALOGE("unregister_client failed");
    }

    return BT_STATUS_FAIL;
  }

  CALL_AND_WAIT_NO_RETURN(gatt->client->configure_mtu(client_if_during_connect,
                                                      MTU_SIZE),
                          WaitMTUChange);

  return BT_STATUS_SUCCESS;
}

int bt_disconnect(char *&saveptr) {
  int clientIf;
  int err = bt_convert_args(saveptr, clientIf);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to convert interface id");

  char *addrString = strtok_r(NULL, " \n", &saveptr);
  bt_bdaddr_t addr;
  LOG_ERROR(!str_to_addr(addrString, addr),
            "Malformed disconnect (bad address)");

  char *connIdString = strtok_r(NULL, " \n", &saveptr);
  int connId = atoi(connIdString);

  CALL_AND_WAIT_NO_RETURN(gatt->client->disconnect(clientIf, &addr, connId),
                          WaitDisconnect);

  if (gatt->client->unregister_client(clientIf) != BT_STATUS_SUCCESS) {
    ALOGW("unregister_client failed");
  }

  return BT_STATUS_SUCCESS;
}

int bt_disconnect_server(char *&saveptr) {
  char *addrString = strtok_r(NULL, " \n", &saveptr);
  bt_bdaddr_t addr;
  LOG_ERROR(!str_to_addr(addrString, addr),
            "Malformed disconnectServer (bad address)");

  char *connIdString = strtok_r(NULL, " \n", &saveptr);
  int connId = atoi(connIdString);

  CALL_AND_WAIT(gatt->server->disconnect(gatt_server_if, &addr, connId),
                WaitServerDisconnect);

  return BT_STATUS_SUCCESS;
}

int bt_update_rssi(char *&saveptr) {
  int clientIf;
  int err = bt_convert_args(saveptr, clientIf);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to convert interface id");

  char *addrString = strtok_r(NULL, " \n", &saveptr);
  bt_bdaddr_t addr;
  LOG_ERROR(!str_to_addr(addrString, addr), "Failed to convert address");

  address_during_rssi_update = addr;

  {
    auto lock = mainThreadWaiter.autoLock();

    if (gatt_client_connection_count) {
      err = gatt->client->read_remote_rssi(clientIf, &addr);
      if (err == BT_STATUS_SUCCESS) {
        mainThreadWaiter.wait(WaitReadRemoteRssi);
      } else {
        ALOGE("read_remote_rssi failed: %d", err);
      }
    } else {
      ALOGW("No clients connected, ignoring command");
      err = BT_STATUS_NOT_READY;
    }
  }

  address_during_rssi_update = kInvalidAddr;

  return err;
}

int bt_discover_services(char *&saveptr) {
  const char *connIdString = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!connIdString, "Malformed discoverServices (no connectionId)");

  const int connectionId = atoi(connIdString);

  int numServices;
  std::auto_ptr<bt_uuid_t> serviceUuids;
  LOG_ERROR(str_to_uuids(saveptr, numServices, serviceUuids),
            "Failed to convert string of uuids");

  // The bluedroid API only lets us filter by a single uuid. If noble sends us more
  // then we just have to scan for all and filter later.
  bt_uuid_t* searchUuid = numServices == 1 ? serviceUuids.get() : nullptr;

  CALL_AND_WAIT(gatt->client->search_service(connectionId, searchUuid),
                WaitSearchService);
  return BT_STATUS_SUCCESS;
}

int bt_discover_included_services(char *&saveptr) {
  int connectionId;
  btgatt_srvc_id_t parentService;

  int err = bt_convert_args(saveptr, connectionId, parentService);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  CALL_AND_WAIT(gatt->client->get_included_service(connectionId,
                                                   &parentService,
                                                   nullptr),
                WaitGetIncludedService);
  return BT_STATUS_SUCCESS;
}

int bt_discover_characteristics(char *&saveptr) {
  int connectionId;
  btgatt_srvc_id_t service;

  int err = bt_convert_args(saveptr, connectionId, service);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  CALL_AND_WAIT(gatt->client->get_characteristic(connectionId,
                                                 &service,
                                                 nullptr),
                WaitGetCharacteristic);
  return BT_STATUS_SUCCESS;
}

int bt_discover_descriptors(char *&saveptr) {
 int connectionId;
  btgatt_srvc_id_t service;
  btgatt_gatt_id_t characteristic;

  int err = bt_convert_args(saveptr, connectionId, service, characteristic);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  CALL_AND_WAIT(gatt->client->get_descriptor(connectionId,
                                             &service,
                                             &characteristic,
                                             nullptr),
                WaitGetDescriptor);
  return BT_STATUS_SUCCESS;
}

int bt_read_characteristic(char *&saveptr) {
  int connectionId;
  btgatt_srvc_id_t service;
  btgatt_gatt_id_t characteristic;
  int authenticationRequested;

  int err = bt_convert_args(saveptr,
                            connectionId,
                            service,
                            characteristic,
                            authenticationRequested);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  CALL_AND_WAIT(gatt->client->read_characteristic(connectionId,
                                                  &service,
                                                  &characteristic,
                                                  authenticationRequested),
                WaitReadCharacteristic);
  return BT_STATUS_SUCCESS;
}

int bt_write_characteristic(char *&saveptr) {
  int connectionId;
  btgatt_srvc_id_t service;
  btgatt_gatt_id_t characteristic;
  int authenticationRequested;

  int err = bt_convert_args(saveptr,
                            connectionId,
                            service,
                            characteristic,
                            authenticationRequested);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no writeType)");

  const int writeType = atoi(token);

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no dataLength)");

  const int dataLength = atoi(token);
  LOG_ERROR(dataLength < 0, "Negative dataLength");

  char data[BTGATT_MAX_ATTR_LEN];

  if (dataLength) {
    token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR(!hexstr_to_buffer(token, data, dataLength),
              "Could not convert data");
  }

  CALL_AND_WAIT(gatt->client->write_characteristic(connectionId,
                                                   &service,
                                                   &characteristic,
                                                   writeType,
                                                   dataLength,
                                                   authenticationRequested,
                                                   data),
                WaitWriteCharacteristic);
  return BT_STATUS_SUCCESS;
}

int bt_enable_notify(char *&saveptr) {
  int clientIf;
  int connectionId;
  bt_bdaddr_t addr;
  btgatt_srvc_id_t service;
  btgatt_gatt_id_t characteristic;

  int err = bt_convert_args(saveptr, clientIf);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to convert interface id");

  err = bt_convert_args(saveptr, connectionId);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to convert connection id");

  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!str_to_addr(token, addr), "Failed to convert address");

  err = bt_convert_args(saveptr, service, characteristic);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to convert service");

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no enable string)");

  const int enable = atoi(token);

  connection_id_during_register_for_notification = connectionId;

  if (enable) {
    CALL_AND_WAIT(gatt->client->register_for_notification(clientIf,
                                                          &addr,
                                                          &service,
                                                          &characteristic),
                  WaitRegisterForNotification);
  } else {
    CALL_AND_WAIT(gatt->client->deregister_for_notification(clientIf,
                                                            &addr,
                                                            &service,
                                                            &characteristic),
                  WaitRegisterForNotification);
  }

  connection_id_during_register_for_notification = -1;

  return BT_STATUS_SUCCESS;
}

int bt_read_descriptor(char *&saveptr) {
  int connectionId;
  btgatt_srvc_id_t service;
  btgatt_gatt_id_t characteristic;
  btgatt_gatt_id_t descriptor;
  int authenticationRequested;

  int err = bt_convert_args(saveptr,
                            connectionId,
                            service,
                            characteristic,
                            descriptor,
                            authenticationRequested);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  CALL_AND_WAIT(gatt->client->read_descriptor(connectionId,
                                              &service,
                                              &characteristic,
                                              &descriptor,
                                              authenticationRequested),
                WaitReadDescriptor);
  return BT_STATUS_SUCCESS;
}

int bt_write_descriptor(char *&saveptr) {
  int connectionId;
  btgatt_srvc_id_t service;
  btgatt_gatt_id_t characteristic;
  btgatt_gatt_id_t descriptor;
  int authenticationRequested;

  int err = bt_convert_args(saveptr,
                            connectionId,
                            service,
                            characteristic,
                            descriptor,
                            authenticationRequested);
  LOG_ERROR(err != BT_STATUS_SUCCESS, "Could not convert");

  const char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR(!token, "Malformed (no dataLength)");

  const int dataLength = atoi(token);
  LOG_ERROR(dataLength < 0, "Negative dataLength");

  char data[BTGATT_MAX_ATTR_LEN];

  if (dataLength) {
    token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR(!hexstr_to_buffer(token, data, dataLength),
              "Could not convert data");
  }

  CALL_AND_WAIT(gatt->client->write_descriptor(connectionId,
                                               &service,
                                               &characteristic,
                                               &descriptor,
                                               WriteTypeDefault,
                                               dataLength,
                                               authenticationRequested,
                                               data),
                WaitWriteDescriptor);
  return BT_STATUS_SUCCESS;
}

int bt_send_notify(char *&saveptr) {
  char *token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR((token == NULL), "Malformed notify (no connection id)");
  int connectionId = atoi(token);

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR((token == NULL), "Malformed notify (no attribute handle)");
  int handle = atoi(token);

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR((token == NULL), "Malformed notify (no confirm)");
  int confirm = atoi(token);

  token = strtok_r(NULL, " \n", &saveptr);
  LOG_ERROR((token == NULL), "Malformed notify (no data length)");
  int dataLength = atoi(token);

  LOG_ERROR((dataLength < 0 || dataLength > MAX_NOTIFICATION_DATA_SIZE),
             "Malformed notify (invalid data length)");

  char *hexData = NULL;
  if (dataLength) {
    token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((token == NULL), "Malformed notify (no data)");
    hexData = token;
  }

  char data[MAX_NOTIFICATION_DATA_SIZE];
  char b[3] = { 0, 0, 0 };
  for (int i = 0; i < dataLength; i++) {
    b[0] = hexData[i * 2];
    b[1] = hexData[i * 2 + 1];
    data[i] = strtol(b, NULL, 16);
  }

  // XXX Figure out how to wait for this? Doesn't look possible because we
  //     only get called back if the device responds.
  CALL_AND_WAIT(gatt->server->send_indication(gatt_server_if,
                                              handle,
                                              connectionId,
                                              dataLength,
                                              confirm,
                                              data),
                WaitNotify);

  return BT_STATUS_SUCCESS;
}

/**
 * This function is run every time a command is received from bleno
 */
int BleCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  char *saveptr;
  int err;


  char *cmd = strtok_r(argv[1], " \n", &saveptr);
  LOG_ERROR(!cmd, "Empty command string");

  ALOGD("Received command %s", cmd);

  static char buf[256];
  snprintf(buf, sizeof(buf), "runCommand:%s", cmd);
  Tracer trc(buf);

  // See if there are any disconnected interfaces that we need to unregister.
  int interfacesToUnregister[disconnected_if_list_count];
  bool unregister = false;
  {
    auto lock = mainThreadWaiter.autoLock();

    if (disconnected_if_list_busy) {
      for (size_t index = 0; index < disconnected_if_list_count; index++) {
        interfacesToUnregister[index] = disconnected_if_list[index];
        disconnected_if_list[index] = -1;
      }
      disconnected_if_list_busy = false;
      unregister = true;
    }
  }

  if (unregister) {
    for (const auto &id : interfacesToUnregister) {
      if (id != -1 &&
          gatt->client->unregister_client(id) != BT_STATUS_SUCCESS) {
        ALOGW("unregister_client failed");
      }
    }
  }

  if (0 == strcmp(argv[1], "initialize")) {
    err = bt_init();
    if (err != BT_STATUS_SUCCESS) {
      ALOGE("Failed to initialize bluetooth (%d)", err);
      bt_cleanup();
      return 1;
    }
  } else if (0 == strcmp(cmd, "getAdapterState")) {
      bledroid.sendEvent("!adapterState powered%s",
                         adapter_state == BT_STATE_OFF ? "Off" : "On");
  } else if (0 == strcmp(cmd, "startAdvertising")) {
    err = bt_start_advertising(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to start advertising");
  } else if (0 == strcmp(cmd, "stopAdvertising")) {
    err = bt_stop_advertising();
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to stop advertising");
  } else if (0 == strcmp(cmd, "startBeacon")) {
    err = bt_start_beacon(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to start beacon");
  } else if (0 == strcmp(cmd, "stopBeacon")) {
    err = bt_stop_beacon();
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to stop beacon");
  } else if (0 == strcmp(cmd, "addService")) {
    char *numAttributesStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((numAttributesStr == NULL),
        "Malformed addService (no numAttributes)");
    int numAttributes = atoi(numAttributesStr);

    char *uuid = strtok_r(NULL, " \n", &saveptr);
    btgatt_srvc_id_t srvc_id;
    srvc_id.is_primary = 1;
    srvc_id.id.inst_id = 0;  // ???
    LOG_ERROR(!str_to_uuid(uuid, srvc_id.id.uuid),
        "Malformed addService (no uuid)");

    ALOGV("addService %d %s\n", numAttributes, uuid);
    CALL_AND_WAIT(gatt->server->add_service(gatt_server_if,
                                            &srvc_id,
                                            numAttributes),
                  WaitAddService);
  } else if (0 == strcmp(cmd, "addCharacteristic")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((serviceHandleStr == NULL),
      "Malformed addCharacteristic (no service)");

    char *uuid = strtok_r(NULL, " \n", &saveptr);
    bt_uuid_t desc_uuid;
    LOG_ERROR(!str_to_uuid(uuid, desc_uuid),
        "Malformed addCharacteristic *(no uuid)");

    char *propStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((propStr == NULL), "Malformed addCharacteristic (no prop)");

    char *permStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((permStr == NULL), "Malformed addCharacteristic (no perm)");

    CALL_AND_WAIT(gatt->server->add_characteristic(gatt_server_if,
                                                   atoi(serviceHandleStr),
                                                   &desc_uuid,
                                                   atoi(propStr),
                                                   atoi(permStr)),
                  WaitAddCharacteristic);
  } else if (0 == strcmp(cmd, "addDescriptor")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((serviceHandleStr == NULL), "Malformed addDescriptor (no service)");

    char *uuid = strtok_r(NULL, " \n", &saveptr);
    bt_uuid_t desc_uuid;
    LOG_ERROR(!str_to_uuid(uuid, desc_uuid), "Malformed addDescriptor (no uuiud)");

    char *permStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((permStr == NULL), "Malformed addDescriptor (no perm)");

    CALL_AND_WAIT(gatt->server->add_descriptor(gatt_server_if,
                                               atoi(serviceHandleStr),
                                               &desc_uuid,
                                               atoi(permStr)),
                  WaitAddDescriptor);
  } else if (0 == strcmp(cmd, "startService")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((serviceHandleStr == NULL), "Malformed startService");

    CALL_AND_WAIT(gatt->server->start_service(gatt_server_if,
                                              atoi(serviceHandleStr),
                                              GATT_TRANSPORT_LE),
                  WaitStartService);
  } else if (0 == strcmp(cmd, "stopService")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((serviceHandleStr == NULL), "Malformed stopService");

    CALL_AND_WAIT(gatt->server->stop_service(gatt_server_if,
                                             atoi(serviceHandleStr)),
                  WaitStopService);
  } else if (0 == strcmp(cmd, "deleteService")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((serviceHandleStr == NULL), "Malformed deleteService");

    CALL_AND_WAIT(gatt->server->delete_service(gatt_server_if,
                                               atoi(serviceHandleStr)),
                  WaitDeleteService);
  } else if (0 == strcmp(cmd, "attributeResponse")) {
    int attr_handle;
    int conn_id;
    int trans_id;
    int result;
    int offset;
    char *hexdata;
    int length;

    char *token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((token == NULL), "Malformed attributeResponse (no conn_id)");
    conn_id = atoi(token);

    token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((token == NULL), "Malformed attributeResponse (no trans_id)");
    trans_id = atoi(token);

    token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((token == NULL), "Malformed attributeResponse (no attr_handle)");
    attr_handle = atoi(token);

    token = strtok_r(NULL, " \n", &saveptr);
    LOG_ERROR((token == NULL), "Malformed attributeResponse (no result)");
    result = atoi(token);

    offset = 0;
    hexdata = NULL;
    length = 0;
    if (result == 0) {
      // <offset> <data> are optional, used only for successful
      // read responses.
      token = strtok_r(NULL, " \n", &saveptr);
      if (token != NULL) {
        offset = atoi(token);

        hexdata = strtok_r(NULL, " \n", &saveptr);
        if (hexdata != NULL) {
          length = strlen(hexdata) / 2;
        }
      }
    }

    btgatt_response_t resp = { };
    resp.handle = attr_handle;
    resp.attr_value.handle = attr_handle;
    resp.attr_value.offset = offset;
    resp.attr_value.auth_req = 0;
    resp.attr_value.len = length;

    char b[3] = { };
    for (int i = 0; i < length; i++) {
      b[0] = hexdata[i * 2];
      b[1] = hexdata[i * 2 + 1];
      resp.attr_value.value[i] = strtol(b, NULL, 16);
    }

    // XXX Figure out how to wait for this? Doesn't look possible because we
    //     only get called back if the device responds.
    err = gatt->server->send_response(conn_id, trans_id, result, &resp);
    LOG_ERROR(err, "gatt server send_response failed: %d", err);
  } else if (0 == strcmp(cmd, "startScanning")) {
    err = bt_start_scan(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to start scanning");
  } else if (0 == strcmp(cmd, "stopScanning")) {
    if (gatt_client_scanning) {
      // XXX Figure out how to wait for this? Maybe switch to batchscan API.
      err = gatt->client->scan(false);
      LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to stop scanning");

      gatt_client_scanning = false;
      ALOGD("Scanning stopped");
    }
  } else if (0 == strcmp(cmd, "connect")) {
    err = bt_connect(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to connect");
  } else if (0 == strcmp(cmd, "disconnect")) {
    err = bt_disconnect(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to disconnect");
  } else if (0 == strcmp(cmd, "updateRssi")) {
    err = bt_update_rssi(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to update rssi");
  } else if (0 == strcmp(cmd, "discoverServices")) {
    err = bt_discover_services(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to discover services");
  } else if (0 == strcmp(cmd, "discoverIncludedServices")) {
    err = bt_discover_included_services(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS,
              "Failed to discover included services");
  } else if (0 == strcmp(cmd, "discoverCharacteristics")) {
    err = bt_discover_characteristics(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to discover characteristics");
  } else if (0 == strcmp(cmd, "discoverDescriptors")) {
    err = bt_discover_descriptors(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to discover descriptors");
  } else if (0 == strcmp(cmd, "readCharacteristic")) {
    err = bt_read_characteristic(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to read characteristic");
  } else if (0 == strcmp(cmd, "writeCharacteristic")) {
    err = bt_write_characteristic(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to write characteristic");
  } else if (0 == strcmp(cmd, "enableNotify")) {
    err = bt_enable_notify(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to write characteristic");
  } else if (0 == strcmp(cmd, "readDescriptor")) {
    err = bt_read_descriptor(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to read descriptor");
  } else if (0 == strcmp(cmd, "writeDescriptor")) {
    err = bt_write_descriptor(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to write descriptor");
  } else if (0 == strcmp(cmd, "disconnectServer")) {
    err = bt_disconnect_server(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to disconnectServer");
  } else if (0 == strcmp(cmd, "sendNotify")) {
    err = bt_send_notify(saveptr);
    LOG_ERROR(err != BT_STATUS_SUCCESS, "Failed to notify");
  } else if (0 == strcmp(cmd, "exit")) {
    bt_cleanup();
  } else {
    bledroid.sendEvent("!unknownCommand %s", argv[1]);
  }
  return 0;
}

int main(int argc, char *argv[]) {
  (void) argc;
  (void) argv;

  Tracer::init();

  Tracer trc("main");

  // Switch to the bluetooth user:group, and additionally keep CAP_NET_ADMIN
  // as the rfkill kernel module, used to enable the bluetooth radio, requires
  // the caller have this capability.
  //
  // See <kernel>/net/rfkill/core.c:rfkill_state_store()
  {
    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);

    setuid(AID_BLUETOOTH);
    setgid(AID_BLUETOOTH);

    prctl(PR_SET_DUMPABLE, 1, 0, 0, 0); // setuid clears PR_SET_DUMPABLE

    __user_cap_header_struct header = {
      .version = _LINUX_CAPABILITY_VERSION,
      .pid = 0
    };

    __user_cap_data_struct cap;
    cap.effective = cap.permitted = cap.inheritable = 1 << CAP_NET_ADMIN;
    int err = capset(&header, &cap);
    if (err) {
      ALOGE("capset failed: %d", err);
      return 1;
    }
  }

  // Start the server socket and register for commands from bleno
  int err = bledroid.start();
  LOG_ERROR((err < 0), "Failed to start bledroid socket listener: %d\n", err);

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
