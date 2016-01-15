#import "SLKWebSocketModule.h"
#import "RCTBridgeModule.h"

#import "Silk-Swift.h"

@implementation SLKWebSocketModule

// Don't rely on the RCT_EXPORT_MODULE macro for this because we want to replace
// the existing RCTWebSocketModule.
+ (NSString *)moduleName
{
  return @"RCTWebSocketModule";
}

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
  if ([message isKindOfClass:[NSData class]]) {
    SLKBlobManager *blobManager = [[self bridge] moduleForClass:[SLKBlobManager class]];
    message = [blobManager store:message];
  }
  [super webSocket:webSocket didReceiveMessage:message];
}

@end
