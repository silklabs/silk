#include <binder/BinderService.h>
#include <binder/IProcessInfoService.h>

#undef LOG_TAG
#define LOG_TAG "fakeprocessinfo"
#include <log/log.h>

using namespace android;

class FakeProcessInfoService : public BinderService<FakeProcessInfoService>,
                               public BnProcessInfoService {
 public:
  static const char *getServiceName() {return "processinfo";}

  FakeProcessInfoService() {}
  virtual ~FakeProcessInfoService() {}
  virtual status_t getProcessStatesFromPids(size_t length,
                                            /*in*/ int32_t* pids,
                                            /*out*/ int32_t* states) {
    for (size_t i = 0; i < length; i++) {
      ALOGI("Providing fake process state for pid %d", pids[i]);
      states[i] = 0;
    }
    return 0;
  }
};

int main(int argc, char **argv) {
  (void) argc, argv;
  FakeProcessInfoService::publishAndJoinThreadPool();
  return 0;
}
