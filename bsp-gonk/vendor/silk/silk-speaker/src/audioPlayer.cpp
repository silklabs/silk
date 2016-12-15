/**
 * Implementation of AudioTrack API
 */

// #define LOG_NDEBUG 0
#define LOG_TAG "silk-speaker"
#include <utils/Log.h>

#include <media/IAudioPolicyService.h>
#include "audioPlayer.h"

static void audioCallback(int event, void* user, void *info) {
  AudioPlayer *player = (AudioPlayer*) user;
  switch (event) {
    case AudioTrack::EVENT_MARKER: {
      ALOGD("Received event EVENT_MARKER");
      player->mReachedEOS = true;
      if (player->mListener != NULL) {
        (*player->mListener)(player->mUserData);
        player->mListener = NULL;
      }
      break;
    }
    default:
      ALOGV("Received unknown event %d", event);
  }
}

/**
 * Constructor
 */
AudioPlayer::AudioPlayer(int sampleRate,
    audio_format_t audioFormat, int channelCount) :
    mListener(NULL),
    mUserData(NULL),
    mSampleRateInHz(sampleRate),
    mAudioFormat(audioFormat),
    mChannelCount(channelCount),
    mStopped(false),
    mAudioTrack(NULL),
    mPlayState(PLAYSTATE_STOPPED),
    mReachedEOS(false) {
  ALOGD("%s sampleRate: %d, audioFormat: %d, channelCount: %d", __FUNCTION__,
      sampleRate, audioFormat, channelCount);
  Mutex::Autolock autoLock(mAudioServiceInitLock);
  ALOGV("Turning on speaker");
  const sp<IAudioPolicyService>& aps = AudioSystem::get_audio_policy_service();
  aps->setForceUse(AUDIO_POLICY_FORCE_FOR_MEDIA, AUDIO_POLICY_FORCE_SPEAKER);
  ALOGD("Finished initializing audio subsystem speaker on: %d",
      aps->getForceUse(AUDIO_POLICY_FORCE_FOR_MEDIA));
}

/**
 * Initialize AudioTrack
 */
void AudioPlayer::init() {
  ALOGV("%s", __FUNCTION__);
  mAudioTrack = new AudioTrack();
  mAudioTrack->set(
      AUDIO_STREAM_DEFAULT,
      mSampleRateInHz,
      mAudioFormat,
      audio_channel_out_mask_from_count(mChannelCount),
      0,
      AUDIO_OUTPUT_FLAG_NONE,
      audioCallback,
      this,
      0,
      0,
      false,
      AUDIO_SESSION_ALLOCATE,
      AudioTrack::TRANSFER_SYNC,
      NULL,
      -1,
      -1,
      NULL);
}

/**
 * Stop AudioTrack playback
 */
void AudioPlayer::stop() {
  ALOGV("%s", __FUNCTION__);

  // Just in case the listener is still waiting for eos
  if (mListener != NULL) {
    (*mListener)(mUserData);
    mListener = NULL;
  }

  if (mAudioTrack != NULL) {
    mAudioTrack->stop();
    mAudioTrack->flush();
    mAudioTrack = NULL;
  }
  mStopped = true;
  mPlayState = PLAYSTATE_STOPPED;
}

/**
 * Write the audio buffer to the AudioTrack to be played
 */
int AudioPlayer::write(const void* bytes, size_t size) {
  ALOGV("%s", __FUNCTION__);
  Mutex::Autolock autoLock(mAudioServiceInitLock);
  if (mAudioTrack == NULL || mStopped) {
    return -1;
  }

  int bytesWritten = writeToAudioTrack(bytes, size);
  return bytesWritten;
}

/**
 * Continue writing audio buffer until the buffer is exhausted
 */
int AudioPlayer::writeToAudioTrack(const void* bytes, size_t size) {
  ALOGV("%s size: %d", __FUNCTION__, size);
  if (mPlayState != PLAYSTATE_PLAYING) {
    ALOGD("AudioTrack not playing, restarting");
    play();
  }

  size_t count = 0;
  while (count < size) {
    int written = mAudioTrack->write(bytes + count, size - count, true);
    ALOGV("Audio data written %d", written);
    if (written <= 0) {
      break;
    }
    count += written;
  }
  return count;
}

/**
 * Set stream volume (gain)
 */
void AudioPlayer::setVolume(float gain) {
  ALOGD("Audio player setting volume %f", gain);
  mAudioTrack->setVolume(gain);
}

/**
 * Start AudioTrack playback
 */
void AudioPlayer::play() {
  ALOGV("%s", __FUNCTION__);
  if (mAudioTrack != NULL) {
    mAudioTrack->start();
    mPlayState = PLAYSTATE_PLAYING;
  }
}

size_t AudioPlayer::frameSize() {
  return mAudioTrack->frameSize();
}

bool AudioPlayer::reachedEOS() {
  return mReachedEOS;
}

status_t AudioPlayer::setNotificationMarkerPosition(uint32_t marker) {
  if (mAudioTrack != NULL) {
    return mAudioTrack->setMarkerPosition(marker);
  }
  return INVALID_OPERATION;
}

void AudioPlayer::setPlaybackPositionUpdateListener(
    const PlaybackPositionUpdateListener listener, void* userData) {
  mListener = listener;
  mUserData = userData;
}
