#import <CommonCrypto/CommonCrypto.h>
#import <CommonCrypto/CommonDigest.h>

#import "RCTUtils.h"
#import "SLKCrypto.h"

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


@implementation SLKCrypto

RCT_EXPORT_MODULE()

- (NSDictionary<NSString *, id> *)constantsToExport
{
  return @{
    @"crypto_sign_ed25519_BYTES": @(crypto_sign_ed25519_BYTES),
    @"crypto_sign_ed25519_PUBLICKEYBYTES": @(crypto_sign_ed25519_PUBLICKEYBYTES),
    @"crypto_sign_ed25519_SECRETKEYBYTES": @(crypto_sign_ed25519_SECRETKEYBYTES),
    @"crypto_sign_ed25519_SEEDBYTES": @(crypto_sign_ed25519_SEEDBYTES),
    @"crypto_scalarmult_BYTES": @(crypto_scalarmult_BYTES)
  };
}

- (instancetype)init
{
  // This module may get reinstantiated if the bridge reloads, but we can't
  // initialize sodium more than once.
  static BOOL sodiumInitialized = NO;
  if (!sodiumInitialized && sodium_init() != 0) {
    NSLog(@"Could not initialize libsodium!");
    return nil;
  }
  sodiumInitialized = YES;

  return [super init];
}

/**
 * Requests a number of random bytes.
 */
RCT_EXPORT_METHOD(genRandomBytesHex:(nonnull NSNumber *)length
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  unsigned char *bytes = malloc(length.unsignedIntValue);
  if (!bytes) {
    @throw([NSException exceptionWithName:@"Out Of Memory" reason:nil userInfo:nil]);
  }

  int ret;
  ret = SecRandomCopyBytes(kSecRandomDefault, length.unsignedIntValue, bytes);

  if (ret != 0) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_RAND_BYTES_FAILED", @"Failed to generate random bytes", error);
    return;
  }

  resolve(binToNSHexString(bytes, length.unsignedIntValue));
}

/**
 * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
 */
RCT_EXPORT_METHOD(genPBKDF2KeyDerivationHex:(NSString *)input
                  salt:(NSString *)salt
                  rounds:(nonnull NSNumber *)rounds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  const char *saltBytes = [salt UTF8String];
  const char *inputBytes = [input UTF8String];
  unsigned char derivedKeyBytes[kCCKeySizeAES256];

  int ret;
  ret = CCKeyDerivationPBKDF(
    kCCPBKDF2,
    inputBytes,
    [input lengthOfBytesUsingEncoding:NSUTF8StringEncoding],
    (const unsigned char *)saltBytes,
    [salt lengthOfBytesUsingEncoding:NSUTF8StringEncoding],
    kCCPRFHmacAlgSHA256,
    rounds.unsignedIntValue,
    derivedKeyBytes,
    sizeof(derivedKeyBytes)
  );

  if (ret != 0) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_PBKDF2_FAILED", @"Failed to derive key", error);
    return;
  }

  resolve(binToNSHexString(derivedKeyBytes, sizeof(derivedKeyBytes)));
}


/**
 * Generate a new Ed25519 key pair.
 */
RCT_EXPORT_METHOD(genEd25519KeyPairHex:(RCTPromiseResolveBlock)resolve
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
RCT_EXPORT_METHOD(genEd25519VerifyingKeyFromSigningKeyHex:(NSString *)seedHex
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

/**
 * Generate Ed25519 signature
 */
RCT_EXPORT_METHOD(genEd25519SignHex:(NSString *)msgHex
                  seed:(NSString *)seedHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if ([seedHex length] != 2 * crypto_sign_ed25519_SEEDBYTES) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:1 userInfo:nil];
    reject(@"E_ED25519_INVALID_KEY_LENGTH", @"Failed to generate public key", error);
    return;
  }

  int ret;

  // Convert seed (secret) to binary.
  unsigned char seedBytes[crypto_sign_ed25519_SEEDBYTES];
  ret = nsHexStringToBin(seedHex, seedBytes, sizeof(seedBytes));
  if (ret != 0) {
    sodium_memzero(seedBytes, sizeof(seedBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_KEY_FORMAT", @"Failed to sign message", error);
    return;
  }

  // Generate libsodium secret key [seed, public key].
  unsigned char publicKeyBytes[crypto_sign_ed25519_PUBLICKEYBYTES];
  unsigned char secretKeyBytes[crypto_sign_ed25519_SECRETKEYBYTES];
  ret = crypto_sign_ed25519_seed_keypair(publicKeyBytes, secretKeyBytes, seedBytes);
  sodium_memzero(seedBytes, sizeof(seedBytes));
  if (ret != 0) {
    sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_KEY_PAIR_FAILED", @"Failed to sign message", error);
    return;
  }

  // Convert message to binary.
  if ([msgHex length] % 2 != 0) {
    sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_MESSAGE_FORMAT", @"Failed to sign message", error);
    return;
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

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_MESSAGE_FORMAT", @"Failed to sign message", error);
    return;
  }

  // Generate signature.
  unsigned char sigBytes[crypto_sign_ed25519_BYTES];
  unsigned long long siglen;
  ret = crypto_sign_ed25519_detached(sigBytes, &siglen, msgBytes, msgBytesLength, secretKeyBytes);
  sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
  sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
  free(msgBytes);
  RCTAssert(siglen == sizeof(sigBytes), @"inconsistent signature length");
  if (ret != 0) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_SIGN_FAILED", @"Failed to sign message", error);
    return;
  }

  // Clean up and convert result to hex.
  NSString *sigHex = binToNSHexString(sigBytes, sizeof(sigBytes));
  sodium_memzero(sigBytes, sizeof(sigBytes));
  resolve(sigHex);
}

/**
 * Verify Ed25519 signature
 */
RCT_EXPORT_METHOD(genEd25519Verify:(NSString *)msgHex
                  signature:(NSString *)sigHex
                  publicKey:(NSString *)pubHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if ([sigHex length] != 2 * crypto_sign_ed25519_BYTES) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:1 userInfo:nil];
    reject(@"E_ED25519_INVALID_SIGNATURE_LENGTH", @"Failed to verify signature", error);
    return;
  }

  if ([pubHex length] != 2 * crypto_sign_ed25519_PUBLICKEYBYTES) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:1 userInfo:nil];
    reject(@"E_ED25519_INVALID_KEY_LENGTH", @"Failed to verify signature", error);
    return;
  }

  int ret;

  // Convert signature to binary.
  unsigned char sigBytes[crypto_sign_ed25519_BYTES];
  ret = nsHexStringToBin(sigHex, sigBytes, sizeof(sigBytes));
  if (ret != 0) {
    sodium_memzero(sigBytes, sizeof(sigBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_SIGNATURE_FORMAT", @"Failed to verify signature", error);
    return;
  }

  // Convert public key to binary.
  unsigned char pubBytes[crypto_sign_ed25519_PUBLICKEYBYTES];
  ret = nsHexStringToBin(pubHex, pubBytes, sizeof(pubBytes));
  if (ret != 0) {
    sodium_memzero(sigBytes, sizeof(sigBytes));
    sodium_memzero(pubBytes, sizeof(pubBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_KEY_FORMAT", @"Failed to verify signature", error);
    return;
  }

  // Convert message to binary.
  if ([msgHex length] % 2 != 0) {
    sodium_memzero(sigBytes, sizeof(sigBytes));
    sodium_memzero(pubBytes, sizeof(pubBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_MESSAGE_FORMAT", @"Failed to verify signature", error);
    return;
  }
  const size_t msgBytesLength = [msgHex length] / 2;
  unsigned char *msgBytes = malloc(msgBytesLength);
  ret = nsHexStringToBin(msgHex, msgBytes, msgBytesLength);
  if (ret != 0) {
    free(msgBytes);
    sodium_memzero(sigBytes, sizeof(sigBytes));
    sodium_memzero(pubBytes, sizeof(pubBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_ED25519_INVALID_MESSAGE_FORMAT", @"Failed to verify signature", error);
    return;
  }

  // Verify signature and clean up.
  ret = crypto_sign_ed25519_verify_detached(sigBytes, msgBytes, msgBytesLength, pubBytes);
  free(msgBytes);
  sodium_memzero(sigBytes, sizeof(sigBytes));
  sodium_memzero(pubBytes, sizeof(pubBytes));

  resolve(@(ret == 0));
}

/**
 * Generate a new X25519 key pair.
 */
RCT_EXPORT_METHOD(genX25519KeyPairHex:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  unsigned char secretKeyBytes[crypto_scalarmult_BYTES];
  unsigned char publicKeyBytes[crypto_scalarmult_BYTES];

  int ret;

  // Random secret key.
  ret = SecRandomCopyBytes(kSecRandomDefault, sizeof secretKeyBytes, secretKeyBytes);
  if (ret != 0) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_RAND_BYTES_FAILED", @"Failed to generate key pair", error);
    return;
  }

  // Generate public key.
  ret = crypto_scalarmult_base(publicKeyBytes, secretKeyBytes);
  if (ret != 0) {
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
    sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_X25519_KEY_PAIR_FAILED", @"Failed to generate key pair", error);
    return;
  }

  // Clean up and convert the result to hex.
  NSString *secretKeyHex = binToNSHexString(secretKeyBytes, sizeof(secretKeyBytes));
  NSString *publicKeyHex = binToNSHexString(publicKeyBytes, sizeof(publicKeyBytes));
  sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
  sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
  resolve(@[secretKeyHex, publicKeyHex]);
}

/**
 * Generate the public key for a given X25519 secret key.
 */
RCT_EXPORT_METHOD(genX25519PublicKeyFromPrivateKeyHex:(NSString *)secretKeyHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if ([secretKeyHex length] != 2 * crypto_scalarmult_BYTES) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:1 userInfo:nil];
    reject(@"E_X25519_INVALID_KEY_LENGTH", @"Failed to generate public key", error);
    return;
  }

  int ret;

  // Convert secret key to binary.
  unsigned char secretKeyBytes[crypto_scalarmult_BYTES];
  ret = nsHexStringToBin(secretKeyHex, secretKeyBytes, sizeof(secretKeyBytes));
  if (ret != 0) {
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_X25519_INVALID_KEY_FORMAT", @"Failed to generate public key", error);
    return;
  }

  // Generate public key.
  unsigned char publicKeyBytes[crypto_scalarmult_BYTES];
  ret = crypto_scalarmult_base(publicKeyBytes, secretKeyBytes);
  if (ret != 0) {
    sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
    sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_X25519_PUB_KEY_FAILED", @"Failed to generate public key", error);
    return;
  }

  // Clean up and convert the result to hex.
  NSString *publicKeyHex = binToNSHexString(publicKeyBytes, sizeof publicKeyBytes);
  sodium_memzero(secretKeyBytes, sizeof(secretKeyBytes));
  sodium_memzero(publicKeyBytes, sizeof(publicKeyBytes));
  resolve(publicKeyHex);
}

/**
 * Generate an X25519 secret.
 */
RCT_EXPORT_METHOD(genX25519SharedSecretHex:(NSString *)ourSecretKeyHex
                  theirPublicKeyHex:(NSString *)theirPublicKeyHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if ([ourSecretKeyHex length] != 2 * crypto_scalarmult_BYTES ||
      [theirPublicKeyHex length] != 2 * crypto_scalarmult_BYTES) {
    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:1 userInfo:nil];
    reject(@"E_X25519_INVALID_KEY_LENGTH", @"Failed to derive shared secret", error);
    return;
  }

  int ret;

  // Convert our secret key to binary.
  unsigned char ourSecretKeyBytes[crypto_scalarmult_BYTES];
  ret = nsHexStringToBin(ourSecretKeyHex, ourSecretKeyBytes, sizeof(ourSecretKeyBytes));
  if (ret != 0) {
    sodium_memzero(ourSecretKeyBytes, sizeof(ourSecretKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_X25519_INVALID_KEY_FORMAT", @"Failed to derive shared secret", error);
    return;
  }

  // Convert their public key to binary.
  unsigned char theirPublicKeyBytes[crypto_scalarmult_BYTES];
  ret = nsHexStringToBin(theirPublicKeyHex, theirPublicKeyBytes, sizeof(theirPublicKeyBytes));
  if (ret != 0) {
    sodium_memzero(ourSecretKeyBytes, sizeof(ourSecretKeyBytes));
    sodium_memzero(theirPublicKeyBytes, sizeof(theirPublicKeyBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_X25519_INVALID_KEY_FORMAT", @"Failed to derive shared secret", error);
    return;
  }

  // Derive shared secret.
  unsigned char sharedSecretBytes[crypto_scalarmult_BYTES];
  ret = crypto_scalarmult(sharedSecretBytes, ourSecretKeyBytes, theirPublicKeyBytes);
  sodium_memzero(ourSecretKeyBytes, sizeof(ourSecretKeyBytes));
  sodium_memzero(theirPublicKeyBytes, sizeof(theirPublicKeyBytes));
  if (ret != 0) {
    sodium_memzero(sharedSecretBytes, sizeof(sharedSecretBytes));

    NSError *error = [NSError errorWithDomain:@"com.silklabs.app" code:ret userInfo:nil];
    reject(@"E_X25519_SHARED_SECRET_FAILED", @"Failed to derive shared secret", error);
    return;
  }

  NSString *sharedSecretHex = binToNSHexString(sharedSecretBytes, sizeof(sharedSecretBytes));
  sodium_memzero(sharedSecretBytes, sizeof(sharedSecretBytes));
  resolve(sharedSecretHex);
}

@end
