#import "SLKWebSocketModule.h"
#import "RCTBridgeModule.h"

#import "Silk-Swift.h"

@implementation SLKWebSocketModule
{
  NSMutableDictionary<NSNumber *, NSNumber *> *_blobsEnabled;
}

// Don't rely on the RCT_EXPORT_MODULE macro for this because we want to replace
// the existing RCTWebSocketModule.
+ (NSString *)moduleName
{
  return @"RCTWebSocketModule";
}

RCT_EXTERN_METHOD(connect:(NSURL *)URL protocols:(NSArray *)protocols headers:(NSDictionary *)headers socketID:(nonnull NSNumber *)socketID)
RCT_EXTERN_METHOD(send:(NSString *)message socketID:(nonnull NSNumber *)socketID)
RCT_EXTERN_METHOD(sendBinary:(NSString *)base64String socketID:(nonnull NSNumber *)socketID)

RCT_EXPORT_METHOD(close:(nonnull NSNumber *)socketID)
{
  [_blobsEnabled removeObjectForKey:socketID];
  [super close:socketID];
}

RCT_EXPORT_METHOD(enableBlobStorage:(nonnull NSNumber *)socketID)
{
  if (!_blobsEnabled) {
    _blobsEnabled = [NSMutableDictionary new];
  }
  [_blobsEnabled setObject:@YES forKey:socketID];
}

#pragma mark - RCTSRWebSocketDelegate methods

- (void)webSocket:(RCTSRWebSocket *)webSocket didReceiveMessage:(id)message
{
  #if RCT_DEV
  if ([webSocket.url.absoluteString hasPrefix:@"ws://localhost:8081/"]) {
    [super webSocket:webSocket didReceiveMessage:message];
    return;
  }
  #endif
  if ([_blobsEnabled objectForKey:webSocket.reactTag] && [message isKindOfClass:[NSData class]]) {
    SLKBlobManager *blobManager = [[self bridge] moduleForClass:[SLKBlobManager class]];
    message = [blobManager store:message];
  }
  [super webSocket:webSocket didReceiveMessage:message];
}

@end
