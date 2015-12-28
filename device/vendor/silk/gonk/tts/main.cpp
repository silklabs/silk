/**
 * TextToSpeech module
 *
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-tts"
#include <utils/Log.h>

#include <stdlib.h>
#include <utils/Timers.h>
#include <json/json.h>
#include <utils/Thread.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <utils/List.h>
#include <utils/Condition.h>
#include <dlfcn.h>

#include "AudioPlayer.h"
#include "EqualizeFilter.h"
#include "FrameworkListener1.h"
#include "tts.h"

using namespace android;
using namespace Json;
using namespace std;

//
// Constants
//
#define TTS_SOCKET_NAME "tts"
#define TTS_COMMAND_NAME "ttsCommand"
#define MAX_MSG_SIZE 128

#define TTS_ENGINE_LIB          "libttspico.so"
#define DEFAULT_TTS_BUFFERSIZE  2048
#define DEFAULT_SPEECH_RATE     "100"
#define DEFAULT_PITCH           "100"
#define PICO_MAX_VOLUME         "500"

//
// Helper macro
//
#define LOG_ERROR(expression, ...) \
  do { \
    if (expression) { \
      ALOGE(__VA_ARGS__); \
      Json::Value jsonMsg; \
      jsonMsg["eventName"] = "error"; \
      mTextToSpeechListener->sendEvent(jsonMsg); \
      return 1; \
    } \
  } while(0)

//
// Forward declarations
//
class TextToSpeechListener;
class SynthesisPlaybackHandler;

typedef android_tts_engine_t *(*android_tts_entrypoint)();

/**
 * Convert int audio format to AudioTrack audio format
 */
static inline audio_format_t audioFormatToNative(
    android_tts_audio_format_t audioFormat) {
  switch (audioFormat) {
    case ANDROID_TTS_AUDIO_FORMAT_PCM_16_BIT:
      return AUDIO_FORMAT_PCM_16_BIT;
    case ANDROID_TTS_AUDIO_FORMAT_PCM_8_BIT:
      return AUDIO_FORMAT_PCM_8_BIT;
    case ANDROID_TTS_AUDIO_FORMAT_DEFAULT:
      return AUDIO_FORMAT_DEFAULT;
    default:
      return AUDIO_FORMAT_INVALID;
  }
}

/**
 * This class provided a method that is run each time
 * {@code TTS_COMMAND_NAME} is received from node over the socket
 */
class TextToSpeechCommand: public FrameworkCommand {
public:
  TextToSpeechCommand(sp<TextToSpeechListener> ttsListener) :
      FrameworkCommand(TTS_COMMAND_NAME),
      startCalled(false),
      mPlaybackHandler(NULL),
      mTextToSpeechListener(ttsListener),
      ttsEngine(NULL),
      mBuffer(new int8_t[DEFAULT_TTS_BUFFERSIZE]) {
  }

  virtual ~TextToSpeechCommand() {
    tts_shutdown();
  }
  int runCommand(SocketClient *c, int argc, char ** argv);
  void test();

  bool startCalled;
  sp<SynthesisPlaybackHandler> mPlaybackHandler;
  sp<TextToSpeechListener> mTextToSpeechListener;

private:
  int tts_init(Value& cmdData);
  int tts_shutdown();
  int tts_stop();
  int tts_synthesizeText(Value& text);

  Reader mJsonReader;
  android_tts_engine_t* ttsEngine;
  int8_t *mBuffer;
};

/**
 * This class provides a wrapper around tts socket to help with
 * sending and receiving messages using the tts socket.
 */
class TextToSpeechListener: private FrameworkListener1, public virtual RefBase {
public:
  TextToSpeechListener() :
      FrameworkListener1(TTS_SOCKET_NAME) {
    FrameworkListener1::registerCmd(new TextToSpeechCommand(this));
  }

  int start() {
    ALOGD("Starting TextToSpeechListener");
    return FrameworkListener1::startListener();
  }

  /**
   * Notify the client of a tts event
   */
  void sendEvent(const Json::Value & jsonMsg) {
    Json::FastWriter fastWriter;
    std::string jsonMessage = fastWriter.write(jsonMsg);

    ALOGV("Broadcasting %s", jsonMessage.c_str());
    FrameworkListener1::sendBroadcast(200, jsonMessage.c_str(), false);
  }
};

/**
 * This class implements a thread that plays audio samples from the synthesized
 * text
 */
class SynthesisPlaybackHandler: public Thread {
public:
  SynthesisPlaybackHandler(uint32_t sampleRate,
      audio_format_t audioFormat, int channelCount,
      sp<TextToSpeechListener> textToSpeechListener) :
      mStopped(false),
      mDone(false),
      mTextToSpeechListener(textToSpeechListener) {
    mAudioTrack = new AudioPlayer(sampleRate, audioFormat, channelCount);
  }

  virtual bool threadLoop();

  /**
   * Start the thread
   */
  void start() {
    run();
  }

  void stop();
  void done();
  void put(int8_t *buffer, int length);

private:
  sp<ABuffer> take();
  Condition mReadReady;

  bool mStopped;
  bool mDone;
  Mutex mListLock;
  sp<AudioPlayer> mAudioTrack;
  List<sp<ABuffer> > mDataBufferList;
  sp<TextToSpeechListener> mTextToSpeechListener;
};

/**************** Implementation of class TextToSpeechCommand *****************/
/**
 * This function is run when a tts command is received from the client
 */
int TextToSpeechCommand::runCommand(SocketClient *c, int argc, char ** argv) {
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
  if (cmdName == "init") {
    tts_init(cmdJson);
  } else if (cmdName == "speak") {
    tts_synthesizeText(cmdJson["text"]);
  } else {
    LOG_ERROR(true, "Invalid command %s", argv[1]);
  }
  return 0;
}

/**
 * Callback for synthesis completed
 */
android_tts_callback_status_t synthesis_callback(void ** pUserData,
    uint32_t trackSamplingHz, android_tts_audio_format_t audioFormat,
    int channelCount, int8_t** pAudioBuffer, size_t* pBufferSize,
    android_tts_synth_status_t status) {
  if (*pUserData == NULL) {
    ALOGE("userdata == NULL");
    return ANDROID_TTS_CALLBACK_HALT;
  }

  TextToSpeechCommand *pMe = static_cast<TextToSpeechCommand*>(*pUserData);

  if (*pAudioBuffer != NULL && *pBufferSize > 0) {
    if (shouldApplyAudioFilter(TTS_ENGINE_LIB)) {
      applyFilter(reinterpret_cast<int16_t*>(*pAudioBuffer), *pBufferSize / 2);
    }

    if (!pMe->startCalled) {
      ALOGD("Synthesis started");
      pMe->startCalled = true;

      audio_format_t format = audioFormatToNative(audioFormat);
      if (format == AUDIO_FORMAT_INVALID) {
        ALOGE("Invalid audio format %d", audioFormat);
        return ANDROID_TTS_CALLBACK_HALT;
      }

      // Start the new thread to begin audio playback
      pMe->mPlaybackHandler = new SynthesisPlaybackHandler(trackSamplingHz,
          format, channelCount, pMe->mTextToSpeechListener);
      pMe->mPlaybackHandler->start();
    }

    // Queue audio data on the audio thread
    pMe->mPlaybackHandler->put(*pAudioBuffer, *pBufferSize);
    memset(*pAudioBuffer, 0, *pBufferSize);
  }

  // Finished synthesis, report event to node process
  if (pAudioBuffer == NULL || status == ANDROID_TTS_SYNTH_DONE) {
    // Notify playback handler that synthesis is done
    pMe->mPlaybackHandler->done();

    return ANDROID_TTS_CALLBACK_HALT;
  }

  *pBufferSize = DEFAULT_TTS_BUFFERSIZE;
  return ANDROID_TTS_CALLBACK_CONTINUE;
}

/**
 * Initialize the TTS engine and returns whether initialization succeeded
 */
int TextToSpeechCommand::tts_init(Value& cmdData) {
  ALOGV("%s", __PRETTY_FUNCTION__);
  string lang = "eng";
  string country = "USA";
  string rate = DEFAULT_SPEECH_RATE;
  string pitch = DEFAULT_PITCH;
  string volume = PICO_MAX_VOLUME;

  // Load TTS engine specified by {@code TTS_ENGINE_LIB} dynamically
  void *engineLibHandle = dlopen(TTS_ENGINE_LIB, RTLD_NOW | RTLD_LOCAL);
  LOG_ERROR((engineLibHandle == NULL), "%s engineLibHandle == NULL", __FUNCTION__);

  android_tts_entrypoint getTtsEngine =
      reinterpret_cast<android_tts_entrypoint>(dlsym(engineLibHandle,
          "android_getTtsEngine"));

  // Support obsolete/legacy binary modules
  if (getTtsEngine == NULL) {
    getTtsEngine = reinterpret_cast<android_tts_entrypoint>(dlsym(
        engineLibHandle, "getTtsEngine"));
  }
  LOG_ERROR((getTtsEngine == NULL), "%s getTtsEngine == NULL", __FUNCTION__);

  ttsEngine = (*getTtsEngine)();
  LOG_ERROR((getTtsEngine == NULL), "%s Unable to get TTSEngine",
      __FUNCTION__);

  android_tts_result_t result = ttsEngine->funcs->init(ttsEngine,
      synthesis_callback, NULL);
  LOG_ERROR((result != ANDROID_TTS_SUCCESS), "ttsEngine->init() failed (%d)",
      result);

  initializeEQ();

  /* Get command parameters */
  if (!cmdData["lang"].isNull()) {
    lang = cmdData["lang"].asString();
  }
  if (!cmdData["country"].isNull()) {
    country = cmdData["country"].asString();
  }
  if (!cmdData["rate"].isNull()) {
    rate = cmdData["rate"].asString();
  }
  if (!cmdData["pitch"].isNull()) {
    pitch = cmdData["pitch"].asString();
  }
  if (!cmdData["volume"].isNull()) {
    volume = cmdData["volume"].asString();
  }

  // Check if language is available
  android_tts_support_result_t langAvailable =
      ttsEngine->funcs->isLanguageAvailable(ttsEngine, lang.c_str(),
          country.c_str(), "");
  LOG_ERROR((langAvailable != ANDROID_TTS_LANG_COUNTRY_AVAILABLE),
      "ttsEngine->isLanguageAvailable failed (%d)", langAvailable);

  // Set language
  result = ttsEngine->funcs->setLanguage(ttsEngine, lang.c_str(),
      country.c_str(), "");
  LOG_ERROR((result != ANDROID_TTS_SUCCESS),
      "ttsEngine->setLanguage failed (%d)", result);

  // Set rate
  result = ttsEngine->funcs->setProperty(ttsEngine, "rate", rate.c_str(),
      rate.length());
  LOG_ERROR((result != ANDROID_TTS_SUCCESS),
      "ttsEngine->setProperty('rate') failed (%d)", result);

  // Set pitch
  result = ttsEngine->funcs->setProperty(ttsEngine, "pitch", pitch.c_str(),
      pitch.length());
  LOG_ERROR((result != ANDROID_TTS_SUCCESS),
      "ttsEngine->setProperty('pitch') failed (%d)", result);

  // Set volume
  result = ttsEngine->funcs->setProperty(ttsEngine, "volume", volume.c_str(),
      volume.length());
  LOG_ERROR((result != ANDROID_TTS_SUCCESS),
      "ttsEngine->setProperty('volume') failed (%d)", result);

  Json::Value jsonMsg;
  jsonMsg["eventName"] = "initialized";
  mTextToSpeechListener->sendEvent(jsonMsg);

  return 0;
}

/**
 * Shut down the TTS engine and releases all associated resources
 */
int TextToSpeechCommand::tts_shutdown() {
  if (ttsEngine != NULL) {
    ttsEngine->funcs->shutdown(ttsEngine);
  }
  return 0;
}

/**
 * Interrupt synthesis and flushes any synthesized data that hasn't been
 * output yet. This will block until callbacks underway are completed.
 */
int TextToSpeechCommand::tts_stop() {
  ALOGV("%s", __PRETTY_FUNCTION__);
  if (ttsEngine != NULL) {
    ttsEngine->funcs->stop(ttsEngine);
  }
  return 0;
}

/**
 * Synthesize the text
 */
int TextToSpeechCommand::tts_synthesizeText(Value& text) {
  ALOGV("%s", __PRETTY_FUNCTION__);
  LOG_ERROR((text.isNull()), "name not specified");
  LOG_ERROR((ttsEngine == NULL), "ttsEngine not initialized");

  // Stop the previous playback session if any
  tts_stop();
  if (mPlaybackHandler != NULL) {
    ALOGV("Stopping previous tts session");
    mPlaybackHandler->stop();
    mPlaybackHandler = NULL;
  }

  initializeFilter();

  const char* textStr = text.asCString();
  memset(mBuffer, 0, DEFAULT_TTS_BUFFERSIZE);

  startCalled = false;
  android_tts_result_t result = ttsEngine->funcs->synthesizeText(ttsEngine,
      textStr, mBuffer, DEFAULT_TTS_BUFFERSIZE, static_cast<void *>(this));
  LOG_ERROR((result != ANDROID_TTS_SUCCESS),
      "ttsEngine->synthesizeText() failed (%d)", result);

  return 0;
}

/************** Implementation of class SynthesisPlaybackHandler **************/
/**
 *  AudioPlayback thread loop
 */
bool SynthesisPlaybackHandler::threadLoop() {
  sp<ABuffer> buffer = NULL;

  mAudioTrack->init();

  // take() will block until:
  // (a) there is a buffer available to tread. In which case
  // a non null value is returned
  // OR (b) stop() is called in which case it will return null
  while (((buffer = take()) != NULL)) {
    mAudioTrack->write(buffer->base(), buffer->capacity());

    // Remove buffer from the list
    mDataBufferList.erase(mDataBufferList.begin());
  }
  mAudioTrack->stop();

  // Clear audio buffer
  mDataBufferList.clear();

  // Notify say service that text synthesis is completed
  Json::Value jsonMsg;
  jsonMsg["eventName"] = "done";
  mTextToSpeechListener->sendEvent(jsonMsg);

  ALOGV("AudioPlayback thread exited");
  return 0;
}

/**
 * Notify that audio synthesis is finished and audio playback to continue
 * till the end of the buffer
 */
void SynthesisPlaybackHandler::done() {
  ALOGV("%s", __PRETTY_FUNCTION__);
  Mutex::Autolock autoLock(mListLock);
  mDone = true;

  // Wake up the audio playback thread if it was waiting on take().
  // take() will return null since mStopped was true, and will then
  // break out of the data write loop.
  ALOGV("%s sending read ready signal", __PRETTY_FUNCTION__);
  mReadReady.signal();
}

/**
 * Stop audio playback
 */
void SynthesisPlaybackHandler::stop() {
  ALOGV("%s", __PRETTY_FUNCTION__);
  Mutex::Autolock autoLock(mListLock);
  mStopped = true;

  // Wake up the audio playback thread if it was waiting on take().
  // take() will return null since mStopped was true, and will then
  // break out of the data write loop.
  ALOGV("%s sending read ready signal", __PRETTY_FUNCTION__);
  mReadReady.signal();

  // Stop the underlying audio track. This will stop sending
  // data to the mixer and discard any pending buffers that the
  // track holds
  mAudioTrack->stop();
}

/**
 * Put audio data into the buffer
 */
void SynthesisPlaybackHandler::put(int8_t *buffer, int length) {
  ALOGV("%s", __PRETTY_FUNCTION__);
  Mutex::Autolock autoLock(mListLock);

  // Don't bother queueing the buffer if we've stopped
  if (mStopped) {
    return;
  }

  mDataBufferList.push_back(ABuffer::CreateAsCopy(buffer, length));
  mReadReady.signal();
}

/**
 *
 */
sp<ABuffer> SynthesisPlaybackHandler::take() {
  ALOGV("%s", __PRETTY_FUNCTION__);
  Mutex::Autolock autoLock(mListLock);

  // Block if there are no available buffers, and stop() has not
  // been called and done() has not been called.
  while (mDataBufferList.size() == 0 && !mStopped && !mDone) {
    mReadReady.wait(mListLock);
  }

  // If stopped, return null so that we can exit the playback loop
  // as soon as possible.
  if (mStopped) {
    ALOGV("%s mStopped = true", __PRETTY_FUNCTION__);
    return NULL;
  }

  // This is the normal playback loop exit case, when done() was
  // called. (mDone will be true at this point).
  if (mDataBufferList.size() == 0) {
    return NULL;
  }

  // Return the first entry from the list
  sp<ABuffer> entry = *(mDataBufferList.begin());

  return entry;
}

/**
 * Entry point into the tts service
 */
int main(int argc, char *argv[]) {
  (void) argc;
  (void) argv;

  // Start the server socket and register for commands from tts node module
  TextToSpeechListener ttsListener;
  int err = ttsListener.start();
  if (err < 0) {
    ALOGE("Failed to start tts socket listener: %d\n", err);

    Json::Value jsonMsg; \
    jsonMsg["eventName"] = "error"; \
    ttsListener.sendEvent(jsonMsg); \
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
