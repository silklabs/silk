#import <CommonCrypto/CommonDigest.h>

#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTJSCExecutor.h"
#import "RCTUtils.h"

#include "sodium.h"


int nsHexStringToBin(NSString *hexString, unsigned char *bytes, size_t bytesLength) {
  RCTAssert(hexString != nil, @"invalid hex string");
  RCTAssert(bytes != NULL, @"invalid bytes buffer");

  const char *hexBytes = [hexString UTF8String];
  const size_t hexBytesLength = strlen(hexBytes);
  RCTAssert(hexBytesLength <= bytesLength * 2, @"invalid hex string length");
  RCTAssert(hexBytesLength % 2 == 0, @"hex string must have even length");

  size_t bytesWritten;
  int ret = sodium_hex2bin(bytes, bytesLength,
                           hexBytes, hexBytesLength,
                           /*ignore*/NULL, &bytesWritten, /*hex_end*/NULL);
  RCTAssert(ret != -1, @"invalid hex string");
  RCTAssert(bytesWritten <= bytesLength, @"buffer overflow!");
  return ret;
}

NSString *binToNSHexString(unsigned char *bytes, size_t bytesLength) {
  RCTAssert(bytes != NULL, @"invalid bytes buffer");
  const size_t hexBytesLength = (bytesLength * 2) + 1;
  char *hex = malloc(hexBytesLength);
  if (!hex) {
    @throw([NSException exceptionWithName:@"Out Of Memory" reason:nil userInfo:nil]);
  }
  sodium_bin2hex(hex, hexBytesLength, bytes, bytesLength);
  return [[NSString alloc] initWithBytesNoCopy:hex
                                        length:hexBytesLength - 1 // we don't want the \0
                                      encoding:NSUTF8StringEncoding
                                  freeWhenDone:YES];
}


@interface AppCryptoSync : NSObject<RCTBridgeModule>
@end

@implementation AppCryptoSync

@synthesize bridge = _bridge;

RCT_EXPORT_MODULE()

- (NSDictionary<NSString *, id> *)constantsToExport
{
  return @{
    // The length of any primite value in the algorithm: seed, public key,
    // R and S in the signature, etc.
    @"EncodingLength": @(crypto_sign_ed25519_SEEDBYTES)
  };
}

- (void)setBridge:(RCTBridge *)bridge
{
  _bridge = bridge;

  // This module may get reinstantiated if the bridge reloads, but we can't
  // initialize sodium more than once.
  static BOOL sodiumInitialized = NO;
  if (!sodiumInitialized && sodium_init() != 0) {
    NSLog(@"Could not initialize libsodium!");
    return;
  }
  sodiumInitialized = YES;

  id<RCTJavaScriptExecutor> executor = [bridge valueForKey:@"javaScriptExecutor"];
  if (![executor isKindOfClass:[RCTJSCExecutor class]]) {
    NSLog(@"Failed to inject ed25519 native implementation into JavaScript context!");
    return;
  }

  // Inject native implementations for EdDSA/Ed25519 signing/verification into
  // the global JS context. They will still get executed synchronously on the JS
  // thread, but they're much faster than any JS implementation.

  // All helpers below return an array of which the first element is an error
  // message and subsequent element(s) are the return value(s).

  [executor addSynchronousHookWithName:@"_crypto_ed25519_sign_hex"
                            usingBlock: ^NSArray<NSString *> *(NSString *msgHex, NSString *seedHex) {
    int ret;

    // Convert seed (secret) to binary.
    unsigned char seedBytes[crypto_sign_ed25519_SEEDBYTES];
    ret = nsHexStringToBin(seedHex, seedBytes, sizeof(seedBytes));
    if (ret != 0) {
      sodium_memzero(seedBytes, sizeof(seedBytes));
      return @[@"Invalid hex string: seed"];
    }

    // Generate libsodium secret key [seed, public key].
    unsigned char publicKeyBytes[crypto_sign_ed25519_PUBLICKEYBYTES];
    unsigned char secretKeyBytes[crypto_sign_ed25519_SECRETKEYBYTES];
    ret = crypto_sign_ed25519_seed_keypair(publicKeyBytes, secretKeyBytes, seedBytes);
    sodium_memzero(seedBytes, sizeof(seedBytes));
    if (ret != 0) {
      sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
      return @[@"Failed to generate keypair from seed."];
    }

    // Convert message to binary.
    if ([msgHex length] % 2 != 0) {
      sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
      return @[@"Invalid hex string: message"];
    }
    const size_t msgBytesLength = [msgHex length] / 2;
    unsigned char *msgBytes = malloc(msgBytesLength);
    if (!msgBytes) {
      @throw([NSException exceptionWithName:@"Out Of Memory" reason:nil userInfo:nil]);
    }
    ret = nsHexStringToBin(msgHex, msgBytes, msgBytesLength);
    if (ret != 0) {
      sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
      free(msgBytes);
      return @[@"Invalid hex string: message"];
    }

    // Generate signature.
    unsigned char sigBytes[crypto_sign_ed25519_BYTES];
    unsigned long long siglen;
    ret = crypto_sign_ed25519_detached(sigBytes, &siglen, msgBytes, msgBytesLength, secretKeyBytes);
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
    free(msgBytes);
    RCTAssert(siglen == sizeof(sigBytes), @"inconsistent signature length");
    if (ret != 0) {
      return @[@"Failed to create signature."];
    }

    // Clean up and convert result to hex.
    return @[[NSNull null], binToNSHexString(sigBytes, sizeof(sigBytes))];
  }];

  [executor addSynchronousHookWithName:@"_crypto_ed25519_verify_hex"
                            usingBlock: ^NSArray<NSString *> *(NSString *msgHex, NSString *sigHex, NSString *pubHex) {
    int ret;

    // Convert signature to binary.
    unsigned char sigBytes[crypto_sign_ed25519_BYTES];
    ret = nsHexStringToBin(sigHex, sigBytes, sizeof(sigBytes));
    if (ret != 0) {
      return @[@"Invalid hex string: signature"];
    }

    // Convert public key to binary.
    unsigned char pubBytes[crypto_sign_ed25519_PUBLICKEYBYTES];
    ret = nsHexStringToBin(pubHex, pubBytes, sizeof(pubBytes));
    if (ret != 0) {
      return @[@"Invalid hex string: public key"];
    }

    // Convert message to binary.
    if ([msgHex length] % 2 != 0) {
      return @[@"Invalid hex string: message"];
    }
    const size_t msgBytesLength = [msgHex length] / 2;
    unsigned char *msgBytes = malloc(msgBytesLength);
    ret = nsHexStringToBin(msgHex, msgBytes, msgBytesLength);
    if (ret != 0) {
      free(msgBytes);
      return @[@"Invalid hex string: message"];
    }

    // Verify signature and clean up.
    ret = crypto_sign_ed25519_verify_detached(sigBytes, msgBytes, msgBytesLength, pubBytes);
    free(msgBytes);
    return @[[NSNull null], (ret == 0) ? @"true" : @"false"];
  }];
}

/**
 * Generate a new Ed25519 key pair.
 */
RCT_EXPORT_METHOD(genEd25519KeyPair:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  unsigned char publicKeyBytes[crypto_sign_ed25519_PUBLICKEYBYTES];
  unsigned char secretKeyBytes[crypto_sign_ed25519_SECRETKEYBYTES];
  int ret = crypto_sign_ed25519_keypair(publicKeyBytes, secretKeyBytes);
  if (ret != 0) {
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_KEY_PAIR_FAILED", @"Failed to generate key pair", error);
    return;
  }

  // Only return the seed part of the secret key.
  NSString *secretKeyHex = binToNSHexString(secretKeyBytes, crypto_sign_ed25519_SEEDBYTES);
  NSString *publicKeyHex = binToNSHexString(publicKeyBytes, sizeof publicKeyBytes);
  sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
  sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
  resolve(@[secretKeyHex, publicKeyHex]);
}

/**
 * Generate the public key for a given Ed25519 secret key.
 */
RCT_EXPORT_METHOD(genEd25519PubKeyFromSecret:(NSString *)seedHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if ([seedHex length] != 2 * crypto_sign_ed25519_SEEDBYTES) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:1 userInfo:nil];
    reject(@"E_ED25519_INVALID_KEY_LENGTH", @"Failed to generate public key", error);
    return;
  }

  // Convert seed (secret) to binary.
  unsigned char seedBytes[crypto_sign_ed25519_SEEDBYTES];
  int ret = nsHexStringToBin(seedHex, seedBytes, sizeof(seedBytes));
  if (ret != 0) {
    sodium_memzero(seedBytes, sizeof(seedBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_KEY_FORMAT", @"Failed to generate public key", error);
    return;
  }

  // Generate libsodium secret key [seed, public key].
  unsigned char publicKeyBytes[crypto_sign_ed25519_PUBLICKEYBYTES];
  unsigned char secretKeyBytes[crypto_sign_ed25519_SECRETKEYBYTES];
  ret = crypto_sign_ed25519_seed_keypair(publicKeyBytes, secretKeyBytes, seedBytes);
  sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
  sodium_memzero(seedBytes, sizeof(seedBytes));
  if (ret != 0) {
    sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_PUB_KEY_FAILED", @"Failed to generate public key", error);
    return;
  }

  NSString *publicKeyHex = binToNSHexString(publicKeyBytes, sizeof publicKeyBytes);
  sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
  resolve(publicKeyHex);
}

@end
