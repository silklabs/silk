/**
 * Patched version of RCTWebSocketModule that supports ws.binaryType = 'blob'
 */

/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

#import "SLKWebSocketModule.h"
#import "SLKBlobManager.h"

#import <objc/runtime.h>

#import "RCTConvert.h"
#import "RCTUtils.h"

@implementation RCTSRWebSocket (React)

- (NSNumber *)reactTag
{
  return objc_getAssociatedObject(self, _cmd);
}

- (void)setReactTag:(NSNumber *)reactTag
{
  objc_setAssociatedObject(self, @selector(reactTag), reactTag, OBJC_ASSOCIATION_COPY_NONATOMIC);
}

@end

@implementation SLKWebSocketModule
{
  NSMutableDictionary<NSNumber *, RCTSRWebSocket *> *_sockets;
  NSMutableSet<NSNumber *> *_blobsEnabled;
}

// Don't rely on the RCT_EXPORT_MODULE macro for this because we want to replace
// the existing RCTWebSocketModule.
+ (NSString *)moduleName
{
  return @"RCTWebSocketModule";
}

- (NSArray *)supportedEvents
{
  return @[@"websocketMessage",
           @"websocketOpen",
           @"websocketFailed",
           @"websocketClosed"];
}

- (void)dealloc
{
  for (RCTSRWebSocket *socket in _sockets.allValues) {
    socket.delegate = nil;
    [socket close];
  }
}

RCT_EXPORT_METHOD(connect:(NSURL *)URL protocols:(NSArray *)protocols headers:(NSDictionary *)headers socketID:(nonnull NSNumber *)socketID)
{
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL];
  [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, id value, BOOL *stop) {
    [request addValue:[RCTConvert NSString:value] forHTTPHeaderField:key];
  }];

  RCTSRWebSocket *webSocket = [[RCTSRWebSocket alloc] initWithURLRequest:request protocols:protocols];
  webSocket.delegate = self;
  webSocket.reactTag = socketID;
  if (!_sockets) {
    _sockets = [NSMutableDictionary new];
  }
  _sockets[socketID] = webSocket;
  [webSocket open];
}

RCT_EXPORT_METHOD(send:(NSString *)message socketID:(nonnull NSNumber *)socketID)
{
  [_sockets[socketID] send:message];
}

RCT_EXPORT_METHOD(sendBinary:(NSString *)base64String socketID:(nonnull NSNumber *)socketID)
{
  NSData *message = [[NSData alloc] initWithBase64EncodedString:base64String options:0];
  [_sockets[socketID] send:message];
}

RCT_EXPORT_METHOD(sendBlob:(NSDictionary *)blob socketID:(nonnull NSNumber *)socketID)
{
  SLKBlobManager *blobManager = [[self bridge] moduleForClass:[SLKBlobManager class]];
  NSData *data = [blobManager resolve:blob];
  // Unfortunately we don't have access to the WebSocket object, so we have to
  // convert it to base64 and send it through the existing method :(
  [self sendBinary:[data base64EncodedStringWithOptions:0] socketID:socketID];
}

RCT_EXPORT_METHOD(setBinaryType:(NSString *)binaryType socketID:(nonnull NSNumber *)socketID)
{
  if (!_blobsEnabled) {
    _blobsEnabled = [NSMutableSet new];
  }
  if ([binaryType isEqualToString:@"blob"]) {
    [_blobsEnabled addObject:socketID];
  } else {
    [_blobsEnabled removeObject:socketID];
  }
}

RCT_EXPORT_METHOD(ping:(nonnull NSNumber *)socketID)
{
  [_sockets[socketID] sendPing:NULL];
}

RCT_EXPORT_METHOD(close:(nonnull NSNumber *)socketID)
{
  [_sockets[socketID] close];
  [_sockets removeObjectForKey:socketID];
}

#pragma mark - RCTSRWebSocketDelegate methods

- (void)webSocket:(RCTSRWebSocket *)webSocket didReceiveMessage:(id)message
{
  NSString *type = @"text";
  if ([message isKindOfClass:[NSData class]]) {
    if (_blobsEnabled && [_blobsEnabled containsObject:webSocket.reactTag]) {
      SLKBlobManager *blobManager = [[self bridge] moduleForClass:[SLKBlobManager class]];
      message = @{
        @"blobId": [blobManager store:message],
        @"offset": @0,
        @"size": @(((NSData *)message).length),
      };
      type = @"blob";
    } else {
      message = [message base64EncodedStringWithOptions:0];
      type = @"binary";
    }
  }
  [self sendEventWithName:@"websocketMessage" body:@{
    @"data": message,
    @"type": type,
    @"id": webSocket.reactTag
  }];
}

- (void)webSocketDidOpen:(RCTSRWebSocket *)webSocket
{
  [self sendEventWithName:@"websocketOpen" body:@{
    @"id": webSocket.reactTag
  }];
}

- (void)webSocket:(RCTSRWebSocket *)webSocket didFailWithError:(NSError *)error
{
  [self sendEventWithName:@"websocketFailed" body:@{
    @"message":error.localizedDescription,
    @"id": webSocket.reactTag
  }];
}

- (void)webSocket:(RCTSRWebSocket *)webSocket didCloseWithCode:(NSInteger)code
           reason:(NSString *)reason wasClean:(BOOL)wasClean
{
  [self sendEventWithName:@"websocketClosed" body:@{
    @"code": @(code),
    @"reason": RCTNullIfNil(reason),
    @"clean": @(wasClean),
    @"id": webSocket.reactTag
  }];
}

@end
