#import <XCTest/XCTest.h>
#import "SLKCrypto.h"

@interface SLKCryptoTest : XCTestCase

@end

@implementation SLKCryptoTest

- (void)testGenRandomBytes {
  SLKCrypto *crypto = [SLKCrypto new];
  __block NSString *randomBytes;
  RCTPromiseResolveBlock resolve = ^(NSString *result) {
    randomBytes = result;
  };
  RCTPromiseRejectBlock reject = ^(NSString *code, NSString *message, NSError *error) {
    XCTAssert(NO, @"Should not get here.");
  };
  [crypto genRandomBytes:@(42) resolver:resolve rejecter:reject];

  XCTAssert(randomBytes != nil, @"Expected a result");
  XCTAssert(randomBytes.length == 84, @"Hex string length");
}

- (void)testGenPBKDF2KeyDerivation {
  NSString *password = @"silklabs";
  NSString *salt = @"engineering@silklabs.com";
  NSNumber *rounds = @(64000);

  SLKCrypto *crypto = [SLKCrypto new];
  __block NSString *key;
  RCTPromiseResolveBlock resolve = ^(NSString *result) {
    key = result;
  };
  RCTPromiseRejectBlock reject = ^(NSString *code, NSString *message, NSError *error) {
    XCTAssert(NO, @"Should not get here.");
  };
  [crypto genPBKDF2KeyDerivation:password salt:salt rounds:rounds resolver:resolve rejecter:reject];

  XCTAssert(
    [key isEqualToString:@"fed892d4c48cb16af5f1fb33754a81be59809518046a7990208c6a61e4b731b8"],
    @"hash must be compatible with JS generated kdf"
  );
}

@end
