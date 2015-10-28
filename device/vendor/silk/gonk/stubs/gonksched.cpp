/*
 * Copyright (C) 2012-2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <binder/BinderService.h>
#include <binder/IPCThreadState.h>
#include <binder/ProcessState.h>
#include <binder/IServiceManager.h>
#include <ISchedulingPolicyService.h>
#include <cutils/sched_policy.h>
#include <private/android_filesystem_config.h>

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

namespace android {

class GonkSchedulePolicyService :
    public BinderService<GonkSchedulePolicyService>,
    public BnSchedulingPolicyService
{
public:
    GonkSchedulePolicyService();
    virtual ~GonkSchedulePolicyService();
    static const char *getServiceName() { return "scheduling_policy"; }

    virtual status_t dump(int fd, const Vector<String16>& args);
    int requestPriority(int32_t pid, int32_t tid, int32_t prio);
    virtual int requestPriority(int32_t pid, int32_t tid, int32_t prio, bool async);
    virtual status_t onTransact(uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags);
};

GonkSchedulePolicyService::GonkSchedulePolicyService()
  : BnSchedulingPolicyService()
{
}

GonkSchedulePolicyService::~GonkSchedulePolicyService()
{
}

status_t
GonkSchedulePolicyService::dump(int fd, const Vector<String16>& args)
{
    (void) fd, args;
    return NO_ERROR;
}

static bool tidBelongsToPid(int32_t tid, int32_t pid)
{
    if (tid == pid)
        return true;

    char filename[64];
    snprintf(filename, sizeof(filename), "/proc/%d/task/%d/status", pid, tid);
    return !access(filename, F_OK);
}

int
GonkSchedulePolicyService::requestPriority(int32_t pid, int32_t tid, int32_t prio)
{
    // See SchedulingPolicyService.java
#define PRIORITY_MIN 1
#define PRIORITY_MAX 3

    IPCThreadState* ipcState = IPCThreadState::self();
    if (ipcState->getCallingUid() != AID_MEDIA ||
        prio < PRIORITY_MIN || prio > PRIORITY_MAX ||
        !tidBelongsToPid(tid, pid))
        return -1; /* PackageManager.PERMISSION_DENIED */

    set_sched_policy(tid, ipcState->getCallingPid() == pid ?
                          SP_AUDIO_SYS : SP_AUDIO_APP);
    struct sched_param param;
    param.sched_priority = prio;
    int rc = sched_setscheduler(tid, SCHED_FIFO, &param);
    if (rc)
        return -1;

    return 0; /* PackageManger.PERMISSION_GRANTED */
}

int
GonkSchedulePolicyService::requestPriority(int32_t pid, int32_t tid, int32_t prio, bool async)
{
    (void) async;
    return requestPriority(pid, tid, prio);
}

enum {
    REQUEST_PRIORITY_TRANSACTION = IBinder::FIRST_CALL_TRANSACTION,
};

status_t
GonkSchedulePolicyService::onTransact(uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags)
{
    switch (code) {
    case REQUEST_PRIORITY_TRANSACTION: {
        CHECK_INTERFACE(ISchedulePolicyService, data, reply);
        int32_t pid = data.readInt32();
        int32_t tid = data.readInt32();
        int32_t prio = data.readInt32();
        requestPriority(pid, tid, prio);
        return NO_ERROR;
        break;
    }
    default:
        return BBinder::onTransact(code, data, reply, flags);
    }
}
}; // namespace android

using namespace android;

int main(int argc, char **argv)
{
    (void) argc, argv;
    GonkSchedulePolicyService::publishAndJoinThreadPool(true);
    return 0;
}
