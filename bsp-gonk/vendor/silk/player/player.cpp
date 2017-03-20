#define LOG_NDEBUG 0
#define LOG_TAG "player"
#include <utils/Log.h>

#include <errno.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/prctl.h>
#include <binder/ProcessState.h>
#include <media/mediaplayer.h>

using namespace android;

#define OK(expression) { \
    status_t err = expression; \
    if (err != 0) { \
      ALOGE(#expression " failed: %d\n", err); \
      exit(1); \
    } \
  }

static int pipefd[2];

static void unblockMainThread() {
  int c = 0;
  write(pipefd[1], &c, 1);
}

class MPListener : public MediaPlayerListener {
public:
  virtual void notify(int msg, int ext1, int ext2, const Parcel *obj) {
    (void) obj;

    switch (msg) {
    case MEDIA_PREPARED:
    case MEDIA_SEEK_COMPLETE:
    case MEDIA_SET_VIDEO_SIZE:
    case MEDIA_STARTED:
    case MEDIA_PAUSED:
      break;
    default:
      ALOGI("Exiting playback on msg=%d, ext1=%d, ext2=%d", msg, ext1, ext2);
      unblockMainThread();
      break;
    }
  }
};

static void signalHandler(int signal) {
  (void) signal;
  ALOGW("Exit signal");
  unblockMainThread();
}

int main(int argc, char **argv) {

  if (argc != 2) {
    ALOGE("filename unspecified");
    return 1;
  }
  signal(SIGTERM, signalHandler);
  signal(SIGHUP, signalHandler);
  signal(SIGPIPE, signalHandler);
  prctl(PR_SET_PDEATHSIG, SIGKILL);

  int fd = open(argv[1], O_RDONLY);
  if (fd < 0) {
    ALOGE("Error %d: Unable to open %s", errno, argv[1]);
    return 1;
  }
  int64_t length = lseek64(fd, 0, SEEK_END);
  lseek64(fd, 0, SEEK_SET);

  OK(pipe(pipefd));

  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  MediaPlayer m;
  OK(m.setListener(new MPListener));
  OK(m.setDataSource(fd, 0, length));
  OK(m.prepare());
  OK(m.start());

  int c;
  TEMP_FAILURE_RETRY(read(pipefd[0], &c, 1));

  // Don't bother trying to shut down cleanly, just let mediaplayer deal with the
  // unexpected disconnect.
  exit(0);
}
