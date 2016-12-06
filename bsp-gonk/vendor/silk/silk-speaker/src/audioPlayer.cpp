/**
 * Implementation of AudioTrack API
 */

// #define LOG_NDEBUG 0
#define LOG_TAG "silk-speaker"
#include <utils/Log.h>

#include <media/IAudioPolicyService.h>
#include "audioPlayer.h"

/**
 * Constructor
 */
AudioPlayer::AudioPlayer(int sampleRate,
    audio_format_t audioFormat, int channelCount) :
    mSampleRateInHz(sampleRate),
    mAudioFormat(audioFormat),
    mChannelCount(channelCount),
    mStopped(false),
    mAudioTrack(NULL),
    mPlayState(PLAYSTATE_STOPPED) {
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
  mAudioTrack = new AudioTrack(AUDIO_STREAM_MUSIC, mSampleRateInHz,
      mAudioFormat, audio_channel_out_mask_from_count(mChannelCount), 0);
}

/**
 * Stop AudioTrack playback
 */
void AudioPlayer::stop() {
  ALOGV("%s", __FUNCTION__);
  if (mAudioTrack != NULL) {
    mAudioTrack->stop();
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
