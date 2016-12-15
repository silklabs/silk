#ifndef AUDIO_PLAYER_H
#define AUDIO_PLAYER_H

#include <media/AudioSystem.h>
#include <media/AudioTrack.h>
#include <utils/RefBase.h>

using namespace android;
using namespace std;

typedef enum _playState {
  /** indicates AudioTrack state is stopped */
  PLAYSTATE_STOPPED = 1,
  /** indicates AudioTrack state is paused */
  PLAYSTATE_PAUSED  = 2,
  /** indicates AudioTrack state is playing */
  PLAYSTATE_PLAYING = 3
} PlayState;

typedef void (*PlaybackPositionUpdateListener)(void *userData);

/**
 *
 */
class AudioPlayer: public RefBase {
public:
  AudioPlayer(int sampleRate, audio_format_t audioFormat, int channelCount);
  void init();
  int write(const void* bytes, size_t size);
  void setVolume(float volume);
  void stop();
  size_t frameSize();
  bool reachedEOS();
  status_t setNotificationMarkerPosition(uint32_t marker);
  void setPlaybackPositionUpdateListener(
      const PlaybackPositionUpdateListener listener, void* userData);

  PlaybackPositionUpdateListener mListener;
  void* mUserData;
  bool mReachedEOS;

private:
  void play();
  int writeToAudioTrack(const void* bytes, size_t size);

  int mSampleRateInHz;
  audio_format_t mAudioFormat;
  int mChannelCount;
  bool mStopped;
  sp<AudioTrack> mAudioTrack;
  PlayState mPlayState;
  Mutex mAudioServiceInitLock;
};

#endif
