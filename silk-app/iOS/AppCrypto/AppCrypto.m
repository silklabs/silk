#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(AppCrypto, AppCrypto, NSObject)
RCT_EXTERN_METHOD(getRandomBytes:(nonnull NSNumber *)length callback:(RCTResponseSenderBlock *)callback)
RCT_EXTERN_METHOD(PBKDF2KeyDerivation:(NSString *)input salt:(NSString *)salt rounds:(nonnull NSNumber *)salt callback:(RCTResponseSenderBlock *)callback)
@end