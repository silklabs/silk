/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

#import "RCTSRWebSocket.h"
#import "RCTWebSocketModule.h"
#import "AppRCTWebSocketModule.h"

@implementation AppRCTWebSocketModule

RCT_EXPORT_MODULE(AppWebSocketModule)


RCT_EXTERN_METHOD(connect:(NSURL *)URL socketID:(nonnull NSNumber *)socketID)
RCT_EXTERN_METHOD(send:(NSString *)message socketID:(nonnull NSNumber *)socketID)
RCT_EXTERN_METHOD(close:(nonnull NSNumber *)socketID)

#pragma mark - RCTSRWebSocketDelegate methods

- (void)webSocket:(RCTSRWebSocket *)webSocket didReceiveMessage:(id)message
{
  #if RCT_DEV
  if ([webSocket.url.absoluteString hasPrefix:@"ws://localhost:8081/"]) {
    [super webSocket:webSocket didReceiveMessage:message];
    return;
  }
  #endif
  id data;
  data = [TypeTransfer convert:message];
  [super webSocket:webSocket didReceiveMessage:data];
}

@end
