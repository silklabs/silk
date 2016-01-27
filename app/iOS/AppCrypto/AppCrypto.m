#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(AppCrypto, AppCrypto, NSObject)
RCT_EXTERN_METHOD(getRandomBytes:(nonnull NSNumber *)length
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(pbkdf2KeyDerivation:(NSString *)input
                  salt:(NSString *)salt
                  rounds:(nonnull NSNumber *)salt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
