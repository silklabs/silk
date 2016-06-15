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

- (void)genEd25519KeyPair:(nonnull RCTPromiseResolveBlock)resolve
                 rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519PubKeyFromSecret:(nonnull NSString *)seedHex
                          resolver:(nonnull RCTPromiseResolveBlock)resolve
                          rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519Sign:(nonnull NSString *)msgHex
                  seed:(nonnull NSString *)seedHex
              resolver:(nonnull RCTPromiseResolveBlock)resolve
              rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519Verify:(nonnull NSString *)msgHex
               signature:(nonnull NSString *)sigHex
               publicKey:(nonnull NSString *)pubHex
                resolver:(nonnull RCTPromiseResolveBlock)resolve
                rejecter:(nonnull RCTPromiseRejectBlock)reject;

@end
