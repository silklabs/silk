#import "RCTBridgeModule.h"

@interface SLKCrypto : NSObject<RCTBridgeModule>

- (void)genRandomBytesHex:(nonnull NSNumber *)length
                resolver:(nonnull RCTPromiseResolveBlock)resolve
                rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genPBKDF2KeyDerivationHex:(nonnull NSString *)input
                          salt:(nonnull NSString *)salt
                        rounds:(nonnull NSNumber *)rounds
                      resolver:(nonnull RCTPromiseResolveBlock)resolve
                      rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519KeyPairHex:(nonnull RCTPromiseResolveBlock)resolve
                    rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519VerifyingKeyFromSigningKeyHex:(nonnull NSString *)seedHex
                                       resolver:(nonnull RCTPromiseResolveBlock)resolve
                                       rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519SignHex:(nonnull NSString *)msgHex
                     seed:(nonnull NSString *)seedHex
                  resolver:(nonnull RCTPromiseResolveBlock)resolve
                  rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genEd25519Verify:(nonnull NSString *)msgHex
               signature:(nonnull NSString *)sigHex
               publicKey:(nonnull NSString *)pubHex
                resolver:(nonnull RCTPromiseResolveBlock)resolve
                rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genX25519KeyPair:(nonnull RCTPromiseResolveBlock)resolve
                rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genX25519PublicKeyFromPrivateKeyHex:(nonnull NSString *)secretKeyHex
                                   resolver:(nonnull RCTPromiseResolveBlock)resolve
                                   rejecter:(nonnull RCTPromiseRejectBlock)reject;

- (void)genX25519SharedSecretHex:(nonnull NSString *)ourSecretKeyHex
               theirPublicKeyHex:(nonnull NSString *)theirPublicKeyHex
                        resolver:(nonnull RCTPromiseResolveBlock)resolve
                        rejecter:(nonnull RCTPromiseRejectBlock)reject;

@end
