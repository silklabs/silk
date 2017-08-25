#include <binder/BinderService.h>
#include <binder/IProcessInfoService.h>

#undef LOG_TAG
#define LOG_TAG "fakeprocessinfo"
#include <log/log.h>

using namespace android;

#ifdef TARGET_GE_NOUGAT
// frameowrks/native@c78404c14274ebe69babbbdd0d829948636a72c0 removed the native
// binder implementation for IProcessInfoService so inline it here.
class BnProcessInfoService : public BnInterface<IProcessInfoService> {
public:
    virtual status_t    onTransact( uint32_t code,
                                    const Parcel& data,
                                    Parcel* reply,
                                    uint32_t flags = 0);
};

status_t BnProcessInfoService::onTransact( uint32_t code, const Parcel& data, Parcel* reply,
        uint32_t flags) {
    switch(code) {
        case GET_PROCESS_STATES_FROM_PIDS: {
            CHECK_INTERFACE(IProcessInfoService, data, reply);
            int32_t arrayLen = data.readInt32();
            if (arrayLen <= 0) {
                reply->writeNoException();
                reply->writeInt32(0);
                reply->writeInt32(NOT_ENOUGH_DATA);
                return NO_ERROR;
            }

            size_t len = static_cast<size_t>(arrayLen);
            int32_t pids[len];
            status_t res = data.read(pids, len * sizeof(*pids));

            // Ignore output array length returned in the parcel here, as the states array must
            // always be the same length as the input PIDs array.
            int32_t states[len];
            for (size_t i = 0; i < len; i++) states[i] = -1;
            if (res == NO_ERROR) {
                res = getProcessStatesFromPids(len, /*in*/ pids, /*out*/ states);
            }
            reply->writeNoException();
            reply->writeInt32Array(len, states);
            reply->writeInt32(res);
            return NO_ERROR;
        } break;
        case GET_PROCESS_STATES_AND_OOM_SCORES_FROM_PIDS: {
            CHECK_INTERFACE(IProcessInfoService, data, reply);
            int32_t arrayLen = data.readInt32();
            if (arrayLen <= 0) {
                reply->writeNoException();
                reply->writeInt32(0);
                reply->writeInt32(NOT_ENOUGH_DATA);
                return NO_ERROR;
            }

            size_t len = static_cast<size_t>(arrayLen);
            int32_t pids[len];
            status_t res = data.read(pids, len * sizeof(*pids));

            // Ignore output array length returned in the parcel here, as the
            // states array must always be the same length as the input PIDs array.
            int32_t states[len];
            int32_t scores[len];
            for (size_t i = 0; i < len; i++) {
                states[i] = -1;
                scores[i] = -10000;
            }
            if (res == NO_ERROR) {
                res = getProcessStatesAndOomScoresFromPids(
                        len, /*in*/ pids, /*out*/ states, /*out*/ scores);
            }
            reply->writeNoException();
            reply->writeInt32Array(len, states);
            reply->writeInt32Array(len, scores);
            reply->writeInt32(res);
            return NO_ERROR;
        } break;
        default:
            return BBinder::onTransact(code, data, reply, flags);
    }
}


#endif

class FakeProcessInfoService : public BinderService<FakeProcessInfoService>,
                               public BnProcessInfoService {
 public:
  static const char *getServiceName() {return "processinfo";}

  FakeProcessInfoService() {}
  virtual ~FakeProcessInfoService() {}

  virtual status_t getProcessStatesFromPids(
    size_t length,
    /*in*/ int32_t* pids,
    /*out*/ int32_t* states
  ) {
    for (size_t i = 0; i < length; i++) {
      ALOGI("Providing fake process state for pid %d", pids[i]);
      states[i] = 0;
    }
    return 0;
  }

#ifdef TARGET_GE_NOUGAT
  virtual status_t getProcessStatesAndOomScoresFromPids(
    size_t length,
    /*in*/ int32_t* pids,
    /*out*/ int32_t* states,
    /*out*/ int32_t* scores
  ) {
    for (size_t i = 0; i < length; i++) {
      ALOGI("Providing fake process state and oomscore for pid %d", pids[i]);
      states[i] = 0;
      scores[i] = 0;
    }
    return 0;
  }
#endif
};

int main(int argc, char **argv) {
  (void) argc, argv;
  FakeProcessInfoService::publishAndJoinThreadPool();
  return 0;
}
