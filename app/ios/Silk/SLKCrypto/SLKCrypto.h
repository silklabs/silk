#import "RCTBridgeModule.h"

@interface SLKCrypto : NSObject<RCTBridgeModule>

- (void)genRandomBytes:(nonnull NSNumber *)length
              resolver:(nonnull RCTPromiseResolveBlock)resolve
              rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genPBKDF2KeyDerivation:(nonnull NSString *)input
                          salt:(nonnull NSString *)salt
                        rounds:(nonnull NSNumber *)rounds
                      resolver:(nonnull RCTPromiseResolveBlock)resolve
                      rejecter:(nonnull RCTPromiseRejectBlock)reject;

@end
