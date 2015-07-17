/**
 * Bleno Bluedroid driver
 *
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "bledroid"
#include <utils/Log.h>

#include <sys/prctl.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <hardware/hardware.h>
#include <hardware/bluetooth.h>
#include <hardware/bt_gatt.h>
#include <utils/Condition.h>
#include <utils/Mutex.h>
#include <sysutils/FrameworkListener.h>
#include <limits.h>

using namespace android;

#define BLE_SOCKET_NAME "bledroid"
#define BLE_COMMAND_NAME "BleCommand"
#define MAX_MSG_SIZE 128

#define BAIL_ON_FAIL(expression) \
  { \
    int err = expression; \
    if (err < 0) { \
      ALOGE(#expression " failed: %d\n", err); \
      exit(1); \
    } \
  } \

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
    vsnprintf(event, MAX_MSG_SIZE, fmt, argptr);
    va_end(argptr);

    ALOGD("Broadcasting %s", event);
    FrameworkListener::sendBroadcast(200, event, false);
  }
};

/**
 *
 */
class ThreadWaiter {
public:
  ThreadWaiter() {}
  ~ThreadWaiter() {}

  void lock() {
    if (mainThreadMutex.tryLock() != 0) {
      ALOGE("Unable to acquire ThreadWaiter lock(), forgot to wait()?");
      abort();
    }
  }

  void wait() {
    mainThreadCondition.wait(mainThreadMutex);
    mainThreadMutex.unlock();
  }

  void signal() {
    mainThreadCondition.signal();
  }

private:
  Mutex mainThreadMutex;
  Condition mainThreadCondition;
};


//
// Global state
//
bt_state_t adapter_state = BT_STATE_OFF;
int gatt_client_if = -1;
int gatt_server_if = -1;
bool gatt_client_listening = false;
btgatt_interface_t const *gatt;
hw_device_t *device;
ThreadWaiter mainThreadWaiter;
BledroidListener bledroid;

// Track the last connect BT address for RSSI.
// (TODO: Ask the client for this address instead)
bt_bdaddr_t lastConnectedAddr = { 0, };

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

static int acquire_wake_lock(const char *lock_name) {
  return BT_STATUS_SUCCESS;
}

static int release_wake_lock(const char *lock_name) {
  return BT_STATUS_SUCCESS;
}

static bt_os_callouts_t os_callouts = {
  sizeof(bt_os_callouts_t),
  set_wake_alarm,
  acquire_wake_lock,
  release_wake_lock,
};


//
// bt_callbacks_t
//

void bt_adapter_state_changed_callback(bt_state_t state) {
  adapter_state = state;
  bledroid.sendEvent("!adapterState powered%s",
      state == BT_STATE_OFF ? "Off" : "On");
  mainThreadWaiter.signal();
}

void bt_adapter_properties_callback(bt_status_t status, int num_properties,
    bt_property_t *properties) {
  for (int i = 0; i < num_properties; i++) {
    bt_property_t *prop = &properties[i];
    if (prop->type == BT_PROPERTY_BDADDR) {
      bt_bdaddr_t *addr = (bt_bdaddr_t *) prop->val;
      bledroid.sendEvent("!address %02X:%02X:%02X:%02X:%02X:%02X",
        addr->address[0],
        addr->address[1],
        addr->address[2],
        addr->address[3],
        addr->address[4],
        addr->address[5]
      );
    }
  }
}

/** GET/SET Remote Device Properties callback */
void bt_remote_device_properties_callback(bt_status_t status,
    bt_bdaddr_t *bd_addr, int num_properties, bt_property_t *properties) {
  ALOGE("bt_remote_device_properties_callback");
}

void bt_device_found_callback(int num_properties, bt_property_t *properties) {
  ALOGE("bt_device_found_callback. num_properties=%d", num_properties);
}

void bt_discovery_state_changed_cb(bt_discovery_state_t state) {
  ALOGE("bt_discovery_state_changed_cb. state=%d", state);
}


/**
 * Bluetooth Legacy PinKey Request callback
 */
void bt_pin_request_callback(bt_bdaddr_t *remote_bd_addr, bt_bdname_t *bd_name,
    uint32_t cod) {
  ALOGE("bt_pin_request_callback");
}

/**
 * Bluetooth SSP Request callback - Just Works & Numeric Comparison
 */
void bt_ssp_request_callback(bt_bdaddr_t *remote_bd_addr, bt_bdname_t *bd_name,
    uint32_t cod, bt_ssp_variant_t pairing_variant, uint32_t pass_key) {
  ALOGE("bt_ssp_request_callback");
}

/**
 * Bluetooth Bond state changed callback
 * Invoked in response to create_bond, cancel_bond or remove_bond
 */
void bt_bond_state_changed_callback(bt_status_t status,
    bt_bdaddr_t *remote_bd_addr, bt_bond_state_t state) {
  ALOGE("bt_bond_state_changed_callback: state=%d", state);
}

/**
 * Bluetooth ACL connection state changed callback
 */
void bt_acl_state_changed_callback(bt_status_t status,
    bt_bdaddr_t *remote_bd_addr, bt_acl_state_t state) {
  bt_bdaddr_t *bda = remote_bd_addr;
  ALOGV("bt_acl_state_changed_callback. status=%d state=%d remote=%02X:%02X:%02X:%02X:%02X:%02X",
    status, state,
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5]);

  if (state == BT_ACL_STATE_CONNECTED) {
    lastConnectedAddr = *remote_bd_addr;
  }
}

void bt_callback_thread_event(bt_cb_thread_evt evt) {
  (void) evt;
}

/**
 * Bluetooth Test Mode Callback
 * Receive any HCI event from controller. Must be in DUT Mode for this callback
 * to be received
 */
void bt_dut_mode_recv_callback(uint16_t opcode, uint8_t *buf, uint8_t len) {
  ALOGE("bt_dut_mode_recv_callback");
}

/**
 * LE Test mode callbacks
 * This callback shall be invoked whenever the le_tx_test, le_rx_test or
 * le_test_end is invoked.
 * The num_packets is valid only for le_test_end command
 */
void bt_le_test_mode_callback(bt_status_t status, uint16_t num_packets) {
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
  bt_energy_info_callback
};

//
// btgatt_client_callbacks_t
//

void gatt_register_client_callback(int status, int client_if,
    bt_uuid_t *app_uuid) {
  (void) app_uuid;
  if (status != 0) {
    ALOGE("register_client failed. error=%d");
    abort();
  }
  gatt_client_if = client_if;
  mainThreadWaiter.signal();
}

void gatt_client_scan_result_callback(bt_bdaddr_t* bda, int rssi,
    uint8_t* adv_data) {
  ALOGV("gatt_client_scan_result_callback. %02X:%02X:%02X:%02X:%02X:%02X rssi=%d",
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5],
    rssi);
}

/**
 * GATT open callback invoked in response to open
 */
void gatt_client_connect_callback(int conn_id, int status, int client_if,
    bt_bdaddr_t* bda) {
  ALOGV("gatt_client_connect_callback: conn_id=%d status=%d client_if=%d "
      "remote=%02X:%02X:%02X:%02X:%02X:%02X",
    conn_id, status, client_if,
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5]);
}

/**
 * Callback invoked in response to close
 */
void gatt_client_disconnect_callback(int conn_id, int status, int client_if,
    bt_bdaddr_t* bda) {
  ALOGV("gatt_client_disconnect_callback: conn_id=%d status=%d client_if=%d "
      "remote=%02X:%02X:%02X:%02X:%02X:%02X",
    conn_id, status, client_if,
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5]);
}

/**
 * GATT characteristic enumeration result callback
 */
void gatt_client_get_characteristic_callback(int conn_id, int status,
    btgatt_srvc_id_t *srvc_id, btgatt_gatt_id_t *char_id, int char_prop) {
  ALOGE("gatt_client_get_characteristic_callback: conn_id=%d "
      "status=%d char_prop=%d", conn_id, status, char_prop);
}

/**
 * GATT descriptor enumeration result callback
 */
void gatt_client_get_descriptor_callback(int conn_id, int status,
    btgatt_srvc_id_t *srvc_id, btgatt_gatt_id_t *char_id,
    btgatt_gatt_id_t *descr_id) {
  ALOGE("gatt_client_get_descriptor_callback: conn_id=%d status=%d", conn_id,
      status);
}


void gatt_client_read_remote_rssi_callback(int client_if, bt_bdaddr_t* bda,
    int rssi, int status) {
  ALOGV("gatt_client_read_remote_rssi_callback: client_if=%d rssi=%d status=%d "
      "bda=%02X:%02X:%02X:%02X:%02X:%02X",
    client_if, rssi, status,
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5]);

  bledroid.sendEvent("!rssiUpdate %d", rssi);
}

void gatt_client_listen_callback(int status, int server_if) {
  bledroid.sendEvent("!listen %d %d", gatt_client_listening ? 1 : 0, status);
}

btgatt_client_callbacks_t bt_gatt_client_callbacks = {
  gatt_register_client_callback,
  gatt_client_scan_result_callback,
  gatt_client_connect_callback,
  gatt_client_disconnect_callback,
  NULL,
  NULL,
  gatt_client_get_characteristic_callback,
  gatt_client_get_descriptor_callback,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  gatt_client_read_remote_rssi_callback,
  gatt_client_listen_callback,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
};


//
// btgatt_server_callbacks_t
//

void gatt_server_register_server_callback(int status, int server_if,
    bt_uuid_t *app_uuid) {
  (void) app_uuid;
  if (status != 0) {
    ALOGE("register_server failed. error=%d");
    abort();
  }
  gatt_server_if = server_if;
  mainThreadWaiter.signal();
}

/**
 * Callback indicating that a remote device has connected or been disconnected
 */
void gatt_server_connection_callback(int conn_id, int server_if, int connected,
    bt_bdaddr_t *bda) {
  if (!bda) {
    ALOGE("gatt_server_connection_callback. NULL bda?\n");
    return;
  }

  ALOGV("gatt_server_connection_callback. conn_id=%d server_if=%d connected=%d\n",
      conn_id, server_if, connected);
  bledroid.sendEvent("!%s %02X:%02X:%02X:%02X:%02X:%02X",
    connected ? "accept" : "disconnect",
    bda->address[0],
    bda->address[1],
    bda->address[2],
    bda->address[3],
    bda->address[4],
    bda->address[5]
  );
}

/**
 * Callback invoked in response to create_service
 */
void gatt_server_service_added_callback(int status, int server_if,
    btgatt_srvc_id_t *srvc_id, int service_handle) {
  ALOGV("gatt_server_service_added_callback: status=%d server_if=%d srvc_handle=%d",
    status, server_if, service_handle);
  if (status == 0 && server_if == gatt_server_if) {
    bledroid.sendEvent("!primaryServiceHandle %d", service_handle);
  }
}

/**
 * Callback indicating that an included service has been added to a service
 */
void gatt_server_included_service_added_callback(int status, int server_if,
    int srvc_handle, int incl_srvc_handle) {
  ALOGE("gatt_server_included_service_added_callback");
}

/**
 * Callback invoked when a characteristic has been added to a service
 */
void gatt_server_characteristic_added_callback(int status, int server_if,
    bt_uuid_t *uuid, int srvc_handle, int char_handle) {
  ALOGV("gatt_server_characteristic_added_callback. status=%d server_if=%d "
      "srvc_handle=%d char_handle=%d",
      status, server_if, srvc_handle, char_handle);
  if (server_if == gatt_server_if) {
    bledroid.sendEvent("!attributeHandle %d", status == 0 ? char_handle : -1);
  }
}

/**
 * Callback invoked when a descriptor has been added to a characteristic
 */
void gatt_server_descriptor_added_callback(int status, int server_if,
    bt_uuid_t *uuid, int srvc_handle, int descr_handle) {
  ALOGV("gatt_server_descriptor_added_callback. status=%d server_if=%d "
      "srvc_handle=%d descr_handle=%d",
      status, server_if, srvc_handle, descr_handle);
  if (server_if == gatt_server_if) {
    bledroid.sendEvent("!attributeHandle %d", status == 0 ? descr_handle : -1);
  }
}

/**
 * Callback invoked in response to start_service
 */
void gatt_server_service_started_callback(int status, int server_if,
    int srvc_handle) {
  ALOGV("gatt_server_service_started_callback: status=%d server_if=%d "
      "srvc_handle=%d", status, server_if, srvc_handle);

  bledroid.sendEvent("!servicesSet %d", status);
}

/**
 * Callback invoked in response to stop_service
 */
void gatt_server_service_stopped_callback(int status, int server_if,
    int srvc_handle) {
  ALOGE("gatt_server_service_stopped_callback");
}

/**
 * Callback triggered when a service has been deleted
 */
void gatt_server_service_deleted_callback(int status, int server_if,
    int srvc_handle) {
  ALOGE("gatt_server_service_deleted_callback");
}

/**
 * Callback invoked when a remote device has requested to read a characteristic
 * or descriptor. The application must respond by calling send_response
 */
void gatt_server_request_read_callback(int conn_id, int trans_id,
    bt_bdaddr_t *bda, int attr_handle, int offset, bool is_long) {
  ALOGV("gatt_server_request_read_callback: conn_id=%d trans_id=%d "
      "attr_handle=%d offset=%d is_long=%d\n",
    conn_id, trans_id, attr_handle, offset, is_long);
  bledroid.sendEvent("!readAttribute %d %d %d %d %d", attr_handle, conn_id,
      trans_id, offset, is_long);
}

/**
 * Callback invoked when a remote device has requested to write to a
 * characteristic or descriptor.
 */
void gatt_server_request_write_callback(int conn_id, int trans_id,
    bt_bdaddr_t *bda, int attr_handle, int offset, int length,
    bool need_rsp, bool is_prep, uint8_t* value) {
  ALOGV("gatt_server_request_write_callback conn_id=%d trans_id=%d "
      "attr_handle=%d offset=%d length=%d need_rsp=%d is_prep=%d value[0]=%d",
      conn_id, trans_id, attr_handle, offset, length, need_rsp, is_prep,
      *value);

  char w[80 + BTGATT_MAX_ATTR_LEN*2];
  snprintf(w, sizeof(w), "!writeAttribute %d %d %d %d %d ", attr_handle,
      conn_id, trans_id, need_rsp, offset);

  if (length >= BTGATT_MAX_ATTR_LEN) {
    ALOGE("Invalid length");
    return;
  }

  char *p = w + strlen(w);
  for (int i = 0; i < length; i++) {
    sprintf(p, "%02x", value[i]);
    p += 2;
  }
  *p = '\n';
  p++;
  *p = '\0';

  if (strlen(w) >= sizeof(w)) {
    abort();  // BUG!
  }

  ALOGE(w);
  bledroid.sendEvent(w);
}

/**
 * Callback invoked when a previously prepared write is to be executed
 */
void gatt_server_request_exec_write_callback(int conn_id, int trans_id,
    bt_bdaddr_t *bda, int exec_write) {
  ALOGE("gatt_server_request_exec_write_callback");
}

/**
 * Callback triggered in response to send_response if the remote device
 * sends a confirmation.
 */
void gatt_server_response_confirmation_callback(int status, int handle) {
  ALOGD("gatt_server_response_confirmation_callback: status=%d handle=%d",
      status, handle);
}

/**
 * Callback confirming that a notification or indication has been sent
 * to a remote device.
 */
void gatt_server_indication_sent_callback(int conn_id, int status) {
  ALOGE("gatt_server_request_exec_write_callback");
}

/**
 * Callback notifying an application that a remote device connection is
 * currently congested and cannot receive any more data. An application should
 * avoid sending more data until a further callback is received indicating the
 * congestion status has been cleared.
 */
void gatt_server_congestion_callback(int conn_id, bool congested) {
  ALOGE("gatt_server_request_exec_write_callback");
}

/**
 * Callback invoked when the MTU for a given connection changes
 */
void gatt_server_mtu_changed_callback(int conn_id, int mtu) {
  bledroid.sendEvent("!mtuChange %d", mtu);
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
    gatt_server_mtu_changed_callback,
};

btgatt_callbacks_t gatt_callbacks = {
  .size = sizeof(btgatt_callbacks_t),
  .client = &bt_gatt_client_callbacks,
  .server = &bt_gatt_server_callbacks
};

// str is expected to be of the form:
//    fb349b5f800000800010000003000000
bool str_to_uuid(char const *str, bt_uuid_t &uuid) {
  if (!str) return false;

  char b[3] = {};

  switch (strlen(str)) {
  case 32:
    for (int i = 0; i < 16; i++) {
      b[0] = str[i*2];
      b[1] = str[i*2+1];
      uuid.uu[i] = strtol(b, NULL, 16);
    }
    break;
  case 4: // 16-bit uuid
    static bt_uuid_t BASE_UUID = {{
      0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80,
      0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    }};
    uuid = BASE_UUID;
    for (int i = 0; i < 2; i++) {
      b[0] = str[i*2];
      b[1] = str[i*2+1];
      uuid.uu[13-i] = strtol(b, NULL, 16);
    }
    break;
  default:
    return false;
  }
  return true;
}

/**
 * Initialize bluetooth subsystem
 */
int bt_init() {
  const hw_module_t *module;
  int err;

  err = hw_get_module(BT_HARDWARE_MODULE_ID, &module);
  if (err) {
    ALOGE("hw_get_module for " BT_HARDWARE_MODULE_ID " failed: %d", err);
    return 1;
  }

  ALOGW("id: %s", module->id);
  ALOGW("name: %s", module->name);
  ALOGW("author: %s", module->author);

  err = module->methods->open(module, BT_HARDWARE_MODULE_ID, &device);
  if (err) {
    ALOGE(BT_HARDWARE_MODULE_ID " open failed: %d", err);
    return 1;
  }

  const bluetooth_device_t *bt_device = (bluetooth_device_t *) device;

  const bt_interface_t *bt = bt_device->get_bluetooth_interface();
  if (!bt) {
    ALOGE("bt_device->get_bluetooth_interface failed");
    return 1;
  }

  if (bt->size != sizeof(*bt)) {
    ALOGE("bt size incorrect, bluetooth.h mismatch?. "
        "Expected %d, got %d", sizeof(*bt), bt->size);
    return 1;
  }

  ALOGV("bt init");
  err = bt->init(&bt_callbacks);
  if (err) {
    ALOGE("bt init() failed: %d", err);
    return 1;
  }

  err = bt->set_os_callouts(&os_callouts);
  if (err) {
    ALOGE("bt set_os_callouts() failed: %d", err);
    return 1;
  }

  ALOGV("bt enable");
  mainThreadWaiter.lock();
  err = bt->enable();
  if (err) {
    ALOGE("bt enable() failed: %d", err);
    return 1;
  }

  while (adapter_state != BT_STATE_ON) {
    ALOGV("waiting for bt enable");
    mainThreadWaiter.wait();
  }

  gatt = static_cast<btgatt_interface_t const *>(bt->get_profile_interface(
      BT_PROFILE_GATT_ID));
  if (!gatt) {
    ALOGE("Unable to get " BT_PROFILE_GATT_ID);
    return 1;
  }

  err = gatt->init(&gatt_callbacks);
  if (err) {
    ALOGE("gatt init() failed: %d", err);
    return 1;
  }

  bt_uuid_t client_uuid = { { 0xDE, 0xAD, 0xBE, 0xEF, } };  // TODO: Generate a real UUID?
  mainThreadWaiter.lock();
  err = gatt->client->register_client(&client_uuid);
  if (err) {
    ALOGE("gatt client register failed: %d", err);
    return 1;
  }

  while (gatt_client_if == -1) {  // Wait for gatt client registration
    mainThreadWaiter.wait();
  }

  bt_uuid_t server_uuid = { { 0xBE, 0xEF, } };  // TODO: Generate a real UUID?
  mainThreadWaiter.lock();
  err = gatt->server->register_server(&server_uuid);
  if (err) {
    ALOGE("gatt server register failed: %d", err);
    return 1;
  }

  while (gatt_server_if == -1) {  // Wait for gatt server registration
    mainThreadWaiter.wait();
  }

  return 0;
}

/**
 *
 */
void bt_cleanup() {
  if (gatt) {
    (void) gatt->server->unregister_server(gatt_server_if);
    (void) gatt->client->unregister_client(gatt_client_if);
    gatt->cleanup();
  }

  ALOGV("bt close");
  if (device) {
    device->close(device);
  }
}

/**
 * This function is run every time a command is received from bleno
 */
int BleCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  char *saveptr;
  int err;

  char *cmd = strtok_r(argv[1], " \n", &saveptr);
  if (!cmd) {
    return 1;
  }

  ALOGD("Received command %s", cmd);
  if (0 == strcmp(argv[1], "clientReady")) {
    bt_init();
  } else if (0 == strcmp(cmd, "setListen")) {
    char *onOff = strtok_r(NULL, " \n", &saveptr);
    if (onOff) {
      gatt_client_listening = (*onOff == '1');
      err = gatt->client->listen(gatt_client_if, gatt_client_listening);
      if (err) {
        ALOGE("gatt client listen failed: %d", err);
      }
    }
  } else if (0 == strcmp(cmd, "readRssi")) {
    err = gatt->client->read_remote_rssi(gatt_client_if, &lastConnectedAddr);
    if (err) {
      ALOGE("gatt client read rssi failed: %d", err);
    }
  } else if (0 == strcmp(cmd, "advertisingData")) {
    char *numServicesStr = strtok_r(NULL, " \n", &saveptr);
    if (numServicesStr != NULL) {
      int numServices = atoi(numServicesStr);
      int service_uuid_len = 0;
      bt_uuid_t service_uuid[numServices];

      for (int i = 0; i < numServices; i++) {
        char *uuid = strtok_r(NULL, " \n", &saveptr);
        if (!str_to_uuid(uuid, service_uuid[service_uuid_len])) {
          ALOGE("Malformed advertisingData (invalid uuid)");
          return 1;
        }
        ALOGV("Adding UUID: %s\n", uuid);
        service_uuid_len += sizeof(bt_uuid_t);
      }

      err = gatt->client->set_adv_data(gatt_client_if,
      false, true, true,  // set_scan_rsp, include_name, include_txpower,
          0, 0, 0,  // min_interval, max_interval, appearance
          0, NULL,  // manufacturer data...
          0, NULL,  // service data...
          service_uuid_len, (char *) service_uuid);
      if (err) {
        ALOGE("gatt client set_adv_data failed: %d", err);
      }
    }
  } else if (0 == strcmp(cmd, "primaryService")) {
    char *numAttributesStr = strtok_r(NULL, " \n", &saveptr);
    if (numAttributesStr == NULL) {
      ALOGE("Malformed primaryService (no numAttributes)");
      return 1;
    }
    int numAttributes = atoi(numAttributesStr);

    char *uuid = strtok_r(NULL, " \n", &saveptr);
    btgatt_srvc_id_t srvc_id;
    srvc_id.is_primary = 1;
    srvc_id.id.inst_id = 0;  // ???
    if (!str_to_uuid(uuid, srvc_id.id.uuid)) {
      ALOGE("Malformed primaryService (no uuid)");
      return 1;
    }

    ALOGV("primaryService %d %s\n", numAttributes, uuid);
    err = gatt->server->add_service(gatt_server_if, &srvc_id, numAttributes);
    if (err) {
      ALOGE("gatt add_service failed: %d", err);
    }
  } else if (0 == strcmp(cmd, "addCharacteristic")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    if (serviceHandleStr == NULL) {
      ALOGE("Malformed addCharacteristic (no service)");
      return 1;
    }

    char *uuid = strtok_r(NULL, " \n", &saveptr);
    bt_uuid_t desc_uuid;
    if (!str_to_uuid(uuid, desc_uuid)) {
      ALOGE("Malformed addCharacteristic *(no uuid)");
      return 1;
    }

    char *propStr = strtok_r(NULL, " \n", &saveptr);
    if (propStr == NULL) {
      ALOGE("Malformed addCharacteristic (no prop)");
      return 1;
    }

    char *permStr = strtok_r(NULL, " \n", &saveptr);
    if (permStr == NULL) {
      ALOGE("Malformed addCharacteristic (no perm)");
      return 1;
    }

    err = gatt->server->add_characteristic(gatt_server_if,
        atoi(serviceHandleStr), &desc_uuid, atoi(propStr), atoi(permStr));
    if (err) {
      ALOGE("gatt add_characteristic failed: %d", err);
    }
  } else if (0 == strcmp(cmd, "addDescriptor")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    if (serviceHandleStr == NULL) {
      ALOGE("Malformed addDescriptor (no service)");
      return 1;
    }

    char *uuid = strtok_r(NULL, " \n", &saveptr);
    bt_uuid_t desc_uuid;
    if (!str_to_uuid(uuid, desc_uuid)) {
      ALOGE("Malformed addDescriptor (no uuiud)");
      return 1;
    }

    char *permStr = strtok_r(NULL, " \n", &saveptr);
    if (permStr == NULL) {
      ALOGE("Malformed addDescriptor (no perm)");
      return 1;
    }

    err = gatt->server->add_descriptor(gatt_server_if, atoi(serviceHandleStr),
        &desc_uuid, atoi(permStr));
    if (err) {
      ALOGE("gatt add_descriptor failed: %d", err);
    }
  } else if (0 == strcmp(cmd, "startService")) {
    char *serviceHandleStr = strtok_r(NULL, " \n", &saveptr);
    if (serviceHandleStr == NULL) {
      ALOGE("Malformed startService");
      return 1;
    }
    err = gatt->server->start_service(gatt_server_if, atoi(serviceHandleStr),
        GATT_TRANSPORT_LE);
    if (err) {
      ALOGE("gatt start_service failed: %d", err);
    }
  } else if (0 == strcmp(cmd, "sendAttributeResponse")) {
    int attr_handle;
    int conn_id;
    int trans_id;
    int result;
    int offset;
    char *hexdata;
    int length;

    char *token = strtok_r(NULL, " \n", &saveptr);
    if (token == NULL) {
      ALOGE("Malformed sendAttributeResponse (no attr_value)");
      return 1;
    }
    attr_handle = atoi(token);

    token = strtok_r(NULL, " \n", &saveptr);
    if (token == NULL) {
      ALOGE("Malformed sendAttributeResponse (no conn_id)");
      return 1;
    }
    conn_id = atoi(token);

    token = strtok_r(NULL, " \n", &saveptr);
    if (token == NULL) {
      ALOGE("Malformed sendAttributeResponse (no trans_id)");
      return 1;
    }
    trans_id = atoi(token);

    token = strtok_r(NULL, " \n", &saveptr);
    if (token == NULL) {
      ALOGE("Malformed sendAttributeResponse (no result)");
      return 1;
    }
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

    err = gatt->server->send_response(conn_id, trans_id, result, &resp);
    if (err) {
      ALOGE("gatt server send_response failed: %d", err);
    }
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

  // Start the server socket and register for commands from bleno
  BAIL_ON_FAIL(bledroid.start());

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
