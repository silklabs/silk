#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(AppCrypto, AppCrypto, NSObject)
RCT_EXTERN_METHOD(getRandomBytes:length(NSNumber*) callback:(RCTResponseSenderBlock*)callback)
@end