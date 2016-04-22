#define LOG_NDEBUG 0
#define LOG_TAG "volume"
#include <utils/Log.h>
#include <media/AudioSystem.h>

using namespace android;

#define VOLUME_MAX_LEVEL 42

int clampVolume(int v) {
  if (v < 0) return 0;
  if (v > VOLUME_MAX_LEVEL) return VOLUME_MAX_LEVEL;
  return v;
}

#define OK(expression) \
  { \
    status_t err = expression; \
    if (err != 0) { \
      ALOGE(#expression " failed: %d\n", err); \
      printf("Error: " #expression " failed: %d\n", err); \
      exit(1); \
    } \
  } \


int main(int argc, char **argv)
{
  int volume = VOLUME_MAX_LEVEL; // Default volume

  if (argc == 1) {
    ALOGV("Initializing audio system");
    for (int as = AUDIO_STREAM_MIN; as < AUDIO_STREAM_PUBLIC_CNT; ++as) {
      OK(AudioSystem::initStreamVolume(static_cast<audio_stream_type_t>(as),
        0, VOLUME_MAX_LEVEL));
    }
    OK(AudioSystem::setMasterMute(false));
    OK(AudioSystem::setMasterVolume(1.0));
    OK(AudioSystem::setMode(AUDIO_MODE_NORMAL));
  } else {
    volume = clampVolume(atoi(argv[1]));
  }

  ALOGW("Volume: %.1f%% (%d of %d)", 100.0 * volume / VOLUME_MAX_LEVEL,
    volume, VOLUME_MAX_LEVEL);

  for (int as = AUDIO_STREAM_MIN; as < AUDIO_STREAM_PUBLIC_CNT; ++as) {
    OK(AudioSystem::setStreamVolumeIndex(static_cast<audio_stream_type_t>(as),
      volume, AUDIO_DEVICE_OUT_SPEAKER));
  }

  return 0;
}
