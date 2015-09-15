#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(AppCrypto, AppCrypto, NSObject)
RCT_EXTERN_METHOD(getRandomBytes:length(NSNumber*) callback:(RCTResponseSenderBlock*)callback)
RCT_EXTERN_METHOD(PBKDF2KeyDerivation:input(NSString*) salt:(NSString*)salt rounds:(NSNumber*)salt callback:(RCTResponseSenderBlock*)callback)
@end