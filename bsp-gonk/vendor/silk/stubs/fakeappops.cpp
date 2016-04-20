/*
 * Copyright (C) 2013 Mozilla Foundation
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
#include <binder/IAppOpsService.h>
#ifdef TARGET_GE_MARSHMALLOW
#include <binder/AppOpsManager.h>
#endif


namespace android {

class FakeAppOpsService :
	public BinderService<FakeAppOpsService>,
	public BnAppOpsService
{
public:
    FakeAppOpsService();
    virtual ~FakeAppOpsService();
    static const char *getServiceName() { return "appops"; }

    virtual int32_t checkOperation(int32_t code, int32_t uid, const String16& packageName);
    virtual int32_t noteOperation(int32_t code, int32_t uid, const String16& packageName);
    virtual int32_t startOperation(int32_t code, int32_t uid, const String16& packageName);
    virtual void finishOperation(int32_t code, int32_t uid, const String16& packageName);

    virtual int32_t startOperation(const sp<IBinder>& token, int32_t code, int32_t uid,
            const String16& packageName);
    virtual void finishOperation(const sp<IBinder>& token, int32_t code, int32_t uid,
            const String16& packageName);
    virtual sp<IBinder> getToken(const sp<IBinder>& clientToken);

    virtual void startWatchingMode(int32_t op, const String16& packageName,
            const sp<IAppOpsCallback>& callback);
    virtual void stopWatchingMode(const sp<IAppOpsCallback>& callback);
#ifdef TARGET_GE_MARSHMALLOW
    virtual int32_t permissionToOpCode(const String16& permission);
#endif
};

FakeAppOpsService::FakeAppOpsService()
  : BnAppOpsService()
{
}

FakeAppOpsService::~FakeAppOpsService()
{
}

int32_t
FakeAppOpsService::checkOperation(int32_t code, int32_t uid, const String16& packageName)
{
    (void) code, uid, packageName;
    return MODE_ALLOWED;
}

int32_t
FakeAppOpsService::noteOperation(int32_t code, int32_t uid, const String16& packageName)
{
    (void) code, uid, packageName;
    return MODE_ALLOWED;
}

int32_t
FakeAppOpsService::startOperation(int32_t code, int32_t uid, const String16& packageName)
{
    (void) code, uid, packageName;
    return MODE_ALLOWED;
}

int32_t
FakeAppOpsService::startOperation(const sp<IBinder>& token, int32_t code, int32_t uid,
    const String16& packageName)
{
    (void) token, code, uid, packageName;
    return MODE_ALLOWED;
}

void
FakeAppOpsService::finishOperation(int32_t code, int32_t uid, const String16& packageName)
{
    (void) code, uid, packageName;
}

void
FakeAppOpsService::finishOperation(const sp<IBinder>& token, int32_t code, int32_t uid,
    const String16& packageName)
{
    (void) token, code, uid, packageName;
}

sp<IBinder>
FakeAppOpsService::getToken(const sp<IBinder>& clientToken)
{
  (void) clientToken;
  return NULL;
}

#ifdef TARGET_GE_MARSHMALLOW
int32_t FakeAppOpsService::permissionToOpCode(const String16& permission)
{
  (void) permission;
  return AppOpsManager::OP_NONE;
}
#endif

void
FakeAppOpsService::startWatchingMode(int32_t op, const String16& packageName, const sp<IAppOpsCallback>& callback)
{
  (void) op, packageName, callback;
}

void
FakeAppOpsService::stopWatchingMode(const sp<IAppOpsCallback>& callback)
{
  (void) callback;
}
}; // namespace android

using namespace android;

int main(int argc, char **argv)
{
    (void ) argc, argv;
    FakeAppOpsService::publishAndJoinThreadPool();
    return 0;
}
