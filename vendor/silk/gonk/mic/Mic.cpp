/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "mic"
#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/MetaData.h>
#include <utils/Thread.h>
#include <sysutils/FrameworkListener.h>

#include "json/json.h"
#include "Micdefs.h"
#include "Channel.h"
#include "AudioReader.h"

using namespace android;
using namespace Json;
using namespace std;

// Constants
#define MIC_CTL_SOCKET_NAME "micctl"
#define MIC_DATA_SOCKET_NAME "micd"
#define MIC_COMMAND_NAME "MicCommand"

// Global variables
bool sDebug = false;

// Helper macros
#define LOG_ERROR(expression, ...) \
  do { \
    if (expression) { \
      ALOGE(__VA_ARGS__); \
      emitEvent("error"); \
      return 1; \
    } \
  } while(0)

// Forward declarations
class MicListener;

// main mic control class to handle commands from node
class MicCommand: public FrameworkCommand {
public:
  MicCommand(MicListener* micListener, Channel* dataChannel) :
      FrameworkCommand(MIC_COMMAND_NAME),
      mMicListener(micListener),
      mHardwareActive(false),
      mDataChannel(dataChannel),
      mAudioSampleRate(8000),
      mAudioChannels(1) {
  }
  virtual ~MicCommand() {}
  int runCommand(SocketClient *c, int argc, char ** argv);

private:
  int start(Value& cmdData);
  int stop();

  void emitEvent(const char* eventName);

  MicListener* mMicListener;
  Reader mJsonReader;

  // Mic related
  bool mHardwareActive;
  sp<AudioReader> mAudioReader;
  Channel* mDataChannel;
  int32_t mAudioSampleRate;
  int32_t mAudioChannels;
};

// class to help with communicating with the mic control socket
class MicListener: private FrameworkListener {
public:
  MicListener(Channel* dataChannel) :
      FrameworkListener(MIC_CTL_SOCKET_NAME) {
    FrameworkListener::registerCmd(new MicCommand(this, dataChannel));
  }

  int startListener() {
    ALOGD("Starting MicListener");
    return FrameworkListener::startListener();
  }

  // send event to node
  void sendEvent(const Value & jsonMsg) {
    FastWriter fastWriter;
    string jsonMessage = fastWriter.write(jsonMsg);

    ALOGV("Broadcasting %s", jsonMessage.c_str());
    FrameworkListener::sendBroadcast(200, jsonMessage.c_str(), false);
  }
};

// This function is run when a mic command is received from the client
int MicCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  char *saveptr;

  char *cmd = strtok_r(argv[1], " \n", &saveptr);
  if (!cmd) {
    return 1;
  }

  ALOGV("Received command: %s", cmd);

  Value cmdJson;
  bool result = mJsonReader.parse(cmd, cmdJson, false);
  LOG_ERROR((result != true), "Failed to parse command: %s",
      mJsonReader.getFormattedErrorMessages().c_str());

  Value cmdNameVal = cmdJson["cmdName"];
  LOG_ERROR((cmdNameVal.isNull()), "cmdName not available");

  string cmdName = cmdNameVal.asString();
  if (cmdName == "start") {
    start(cmdJson["cmdData"]);
  } else if (cmdName == "stop") {
    stop();
  } else {
    LOG_ERROR(true, "Invalid command %s", cmdName.c_str());
  }

  return 0;
}

// Initialize mic and start sending frames to node
int MicCommand::start(Value& cmdData) {
  ALOGV("%s", __FUNCTION__);

  if (mHardwareActive) {
    emitEvent("start");
    return 0;
  }

  LOG_ERROR((cmdData.isNull()), "start command data is null");

  if (!cmdData["audioSampleRate"].isNull()) {
    mAudioSampleRate = cmdData["audioSampleRate"].asInt();
    ALOGV("mAudioSampleRate %d", mAudioSampleRate);
  }
  if (!cmdData["audioChannels"].isNull()) {
    mAudioChannels = cmdData["audioChannels"].asInt();
    ALOGV("mAudioChannels %d", mAudioChannels);
  }
  if (!cmdData["debug"].isNull()) {
    sDebug = cmdData["debug"].asInt();
    ALOGV("sDebug %d", sDebug);
  }

  // TODO handle start fail
  mAudioReader = 
    new AudioReader(mDataChannel, mAudioSampleRate, mAudioChannels);
  mAudioReader->start();

  emitEvent("start");
  mHardwareActive = true;

  return 0;
}

// stop mic streaming
int MicCommand::stop() {
  if (mHardwareActive) {
    mAudioReader->stop();
    mAudioReader.clear();
  }
  mHardwareActive = false;
  emitEvent("stop");

  return 0;
}

// Emit event to node
void MicCommand::emitEvent(const char* eventName) {
  Value jsonMsg;
  jsonMsg["eventName"] = eventName;
  mMicListener->sendEvent(jsonMsg);
}

int main(int argc, char **argv) {
  (void) argc;
  (void) argv;

  // Start the data socket used to send pcm samples to node
  Channel* dataChannel = new Channel(MIC_DATA_SOCKET_NAME);
  int err = dataChannel->startListener();
  if (err < 0) {
    ALOGE("Failed to start mic data socket listener: %d\n", err);
    return 1;
  }

  // Start control socket used to receive cmds from and to emit events to node
  MicListener micListener(dataChannel);
  err = micListener.startListener();
  if (err < 0) {
    ALOGE("Failed to start mic ctl socket listener: %d\n", err);
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
