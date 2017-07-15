/*
 * Copyright (C) 2012 Mozilla Foundation
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
#include <binder/IPermissionController.h>
#include <private/android_filesystem_config.h>

#undef LOG_TAG
#define LOG_TAG "fakeperm"
#include <log/log.h>

#ifndef ALOGE
#define ALOGE LOGE
#endif

namespace android {

class FakePermissionService :
    public BinderService<FakePermissionService>,
    public BnPermissionController
{
public:
    FakePermissionService();
    virtual ~FakePermissionService();
    static const char *getServiceName() { return "permission"; }

    virtual status_t dump(int fd, const Vector<String16>& args);
    virtual bool checkPermission(const String16& permission, int32_t pid, int32_t uid);
#ifdef TARGET_GE_MARSHMALLOW
    virtual void getPackagesForUid(const uid_t uid, Vector<String16> &packages);
    virtual bool isRuntimePermission(const String16& permission);
#endif
};

FakePermissionService::FakePermissionService()
    : BnPermissionController()
{
}

FakePermissionService::~FakePermissionService()
{
}

status_t
FakePermissionService::dump(int fd, const Vector<String16>& args)
{
    (void) fd;
    (void) args;
    return NO_ERROR;
}

bool
FakePermissionService::checkPermission(const String16& permission, int32_t pid, int32_t uid)
{
    String8 perm8(permission);
    if (perm8 == "android.permission.CAMERA") {
      if (uid == 0 || uid == AID_CAMERA) {
        return true;
      }
    } else if (perm8 == "android.permission.ACCESS_SURFACE_FLINGER") {
      if (uid == AID_CAMERA) {
        return true;
      }
    } else if (perm8 == "android.permission.RECORD_AUDIO") {
      if (uid == 0 || uid == AID_CAMERA) {
        return true;
      }
    } else if (perm8 == "android.permission.MODIFY_AUDIO_SETTINGS") {
      if (uid == 0 || uid == AID_AUDIO) {
        return true;
      }
    }
#ifdef FAKEPERM_GRANT_EVERY_REQUEST
    ALOGE("%s for pid=%d,uid=%d granted",
        String8(permission).string(), pid, uid);
    return true;
#else
    ALOGE("%s for pid=%d,uid=%d denied",
        String8(permission).string(), pid, uid);
    return false;
#endif
}

#ifdef TARGET_GE_MARSHMALLOW
void
FakePermissionService::getPackagesForUid(const uid_t uid, Vector<String16> &packages)
{
    (void) uid;
    (void) packages;
}

bool
FakePermissionService::isRuntimePermission(const String16& permission)
{
    (void) permission;
    return false;
}

#endif

}; // namespace android

using namespace android;

int main(int argc, char **argv)
{
    (void) argc;
    (void) argv;
    FakePermissionService::publishAndJoinThreadPool();
    return 0;
}
