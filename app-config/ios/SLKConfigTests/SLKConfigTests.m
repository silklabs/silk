#import <XCTest/XCTest.h>
#import "SLKConfig.h"

@interface SLKConfigTest : XCTestCase

@end

@interface SLKConfig (SLKConfigTest)
- (void)loadFromData:(NSData *)data;
@end

@implementation SLKConfigTest

- (void)testEmptyConfig {
  SLKConfig *config = [SLKConfig new];
  XCTAssert([[config.jsBundleURL absoluteString] hasSuffix:@"/main.jsbundle"], @"defaults to packaged JS bundle");
}

- (void)testRemoteBundle {
  NSString *config_json = @"{\"react-native\": {\"type\": \"remote\", \"host\": \"192.168.1.42\"}}";
  SLKConfig *config = [SLKConfig new];
  [config loadFromData:[config_json dataUsingEncoding:NSUTF8StringEncoding]];
  NSURLComponents *components = [[NSURLComponents alloc] initWithURL:config.jsBundleURL resolvingAgainstBaseURL:NO];
  XCTAssert([components.host isEqualToString:@"192.168.1.42"], @"uses specified host");
  XCTAssert([components.port isEqualToNumber:@(8081)], @"uses default packager port");
}

- (void)testLocalBundle {
  NSString *config_json = @"{\"react-native\": {\"type\": \"local\", \"host\": \"192.168.1.42\"}}";
  SLKConfig *config = [SLKConfig new];
  [config loadFromData:[config_json dataUsingEncoding:NSUTF8StringEncoding]];
  XCTAssert([[config.jsBundleURL absoluteString] hasSuffix:@"/main.jsbundle"], @"local JS bundle gets packaged");
}

- (void)testJSON {
  NSString *config_json = @"{\"debug\": \"*\"}";
  SLKConfig *config = [SLKConfig new];
  [config loadFromData:[config_json dataUsingEncoding:NSUTF8StringEncoding]];
  XCTAssert([config.debug isEqualToString:@"*"], @"debug value gets read");
}

@end
