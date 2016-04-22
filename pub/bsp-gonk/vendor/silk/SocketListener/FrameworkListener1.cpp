/*
 * Copyright (C) 2008 The Android Open Source Project
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
#include <errno.h>
#include <string.h>
#include <stdlib.h>

#define LOG_TAG "FrameworkListener1"

#include <cutils/log.h>

#include "FrameworkListener1.h"
#include <sysutils/FrameworkCommand.h>
#include <sysutils/SocketClient.h>

static const int CMD_BUF_SIZE = 1024;

#define UNUSED __attribute__((unused))

FrameworkListener1::FrameworkListener1(const char *socketName, bool withSeq) :
                            SocketListener1(socketName, true, withSeq) {
    init(socketName, withSeq);
}

FrameworkListener1::FrameworkListener1(const char *socketName) :
                            SocketListener1(socketName, true, false) {
    init(socketName, false);
}

FrameworkListener1::FrameworkListener1(int sock) :
                            SocketListener1(sock, true) {
    init(NULL, false);
}

void FrameworkListener1::init(const char *socketName UNUSED, bool withSeq) {
    mCommands = new FrameworkCommandCollection();
    errorRate = 0;
    mCommandCount = 0;
    mWithSeq = withSeq;
}

bool FrameworkListener1::onDataAvailable(SocketClient *c) {
    char buffer[CMD_BUF_SIZE];
    int len;

    len = TEMP_FAILURE_RETRY(read(c->getSocket(), buffer, sizeof(buffer)));
    if (len < 0) {
        SLOGE("read() failed (%s)", strerror(errno));
        return false;
    } else if (!len)
        return false;
   if(buffer[len-1] != '\0')
        SLOGW("String is not zero-terminated");

    int offset = 0;
    int i;

    for (i = 0; i < len; i++) {
        if (buffer[i] == '\0') {
            /* IMPORTANT: dispatchCommand() expects a zero-terminated string */
            dispatchCommand(c, buffer + offset);
            offset = i + 1;
        }
    }

    return true;
}

void FrameworkListener1::registerCmd(FrameworkCommand *cmd) {
    mCommands->push_back(cmd);
}

void FrameworkListener1::dispatchCommand(SocketClient *cli, char *data) {
    int argc = 0;
    char *argv[FrameworkListener1::CMD_ARGS_MAX];

    memset(argv, 0, sizeof(argv));
    argv[argc++] = strdup(data);

    FrameworkCommand *c = *mCommands->begin();
    if (c->runCommand(cli, argc, argv)) {
      SLOGW("Handler '%s' error (%s)", c->getCommand(), strerror(errno));
    }
    for (int j = 0; j < argc; j++) {
      free(argv[j]);
    }
    return;
}
