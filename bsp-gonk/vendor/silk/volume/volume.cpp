#define LOG_NDEBUG 0
#define LOG_TAG "volume"
#include <log/log.h>
#include <cutils/properties.h>
#include <media/AudioSystem.h>

using namespace android;

#define VOLUME_MAX_LEVEL 100

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
  (void) argc;
  (void) argv;

  int level = clampVolume(property_get_int32("persist.silk.volume.level", 0));
  bool mute = property_get_bool("persist.silk.volume.mute", 0) != 0;
  bool init = property_get_bool("silk.volume.init", 0) != 0;

  if (!init) {
    ALOGV("Initializing audio system");
    for (int as = AUDIO_STREAM_MIN; as < AUDIO_STREAM_PUBLIC_CNT; ++as) {
      OK(AudioSystem::initStreamVolume(static_cast<audio_stream_type_t>(as),
        0, VOLUME_MAX_LEVEL));
    }
    OK(AudioSystem::setMasterVolume(1.0));
    OK(AudioSystem::setMode(AUDIO_MODE_NORMAL));
    property_set("silk.volume.init", "true");
  }

  ALOGW("Volume: %.1f%% (%d of %d) mute=%d", 100.0 * level / VOLUME_MAX_LEVEL,
    level, VOLUME_MAX_LEVEL, mute);

  OK(AudioSystem::setMasterMute(mute));
  for (int as = AUDIO_STREAM_MIN; as < AUDIO_STREAM_PUBLIC_CNT; ++as) {
    OK(AudioSystem::setStreamVolumeIndex(static_cast<audio_stream_type_t>(as),
      level, AUDIO_DEVICE_OUT_SPEAKER));
  }

  return 0;
}
