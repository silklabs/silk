/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

#import "RCTWebSocketModule.h"
#import "RCTSRWebSocket.h"

// See https://github.com/facebook/react-native/pull/5321
@interface RCTWebSocketModule () <RCTSRWebSocketDelegate>
@end

@interface AppRCTWebSocketModule : RCTWebSocketModule
@end
