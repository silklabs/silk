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
#include <utils/Log.h>

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
    return NO_ERROR;
}

bool
FakePermissionService::checkPermission(const String16& permission, int32_t pid, int32_t uid)
{
    if (0 == uid)
        return true;

    // Camera/audio record permissions are only for apps with the
    // "camera" permission.  These apps are also the only apps granted
    // the AID_SDCARD_RW supplemental group (bug 785592)

    if (uid < AID_APP) {
        ALOGE("%s for pid=%d,uid=%d denied: not an app",
            String8(permission).string(), pid, uid);
        return false;
    }

    String8 perm8(permission);
    if (perm8 != "android.permission.CAMERA" &&
        perm8 != "android.permission.RECORD_AUDIO") {

        ALOGE("%s for pid=%d,uid=%d denied: unsupported permission",
            String8(permission).string(), pid, uid);
        return false;
    }

    char filename[32];
    snprintf(filename, sizeof(filename), "/proc/%d/status", pid);
    FILE *f = fopen(filename, "r");
    if (!f) {
        ALOGE("%s for pid=%d,uid=%d denied: unable to open %s",
            String8(permission).string(), pid, uid, filename);
        return false;
    }

    char line[80];
    while (fgets(line, sizeof(line), f)) {
        char *save;
        char *name = strtok_r(line, "\t", &save);
        if (!name)
            continue;

        if (strcmp(name, "Groups:"))
            continue;

        char *group;
        while ((group = strtok_r(NULL, " \n", &save))) {
            #define _STR(x) #x
            #define STR(x) _STR(x)
            if (!strcmp(group, STR(AID_SDCARD_RW))) {
                fclose(f);
                return true;
            }
        }
        break;
    }
    fclose(f);

    ALOGE("%s for pid=%d,uid=%d denied: missing group",
        String8(permission).string(), pid, uid);
    return false;
}
}; // namespace android

using namespace android;

int main(int argc, char **argv)
{
    FakePermissionService::publishAndJoinThreadPool();
    return 0;
}
