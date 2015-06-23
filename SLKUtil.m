
#import "SLKUtil.h"

#import <Foundation/Foundation.h>
@import SystemConfiguration.CaptiveNetwork;

#import "RCTBridge.h"

@implementation SLKUtil

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getNetInfo:(RCTResponseSenderBlock)callback) {
  NSArray *interfaceNames = CFBridgingRelease(CNCopySupportedInterfaces());
  NSLog(@"%s: Supported interfaces: %@", __func__, interfaceNames);
  
  NSDictionary *SSIDInfo;
  for (NSString *interfaceName in interfaceNames) {
    SSIDInfo = CFBridgingRelease(
                                 CNCopyCurrentNetworkInfo((__bridge CFStringRef)interfaceName));
    NSLog(@"%s: %@ => %@", __func__, interfaceName, SSIDInfo);
    
    BOOL isNotEmpty = (SSIDInfo.count > 0);
    if (isNotEmpty) {
      break;
    }
  }
  NSString* ssid = @"";
  if (SSIDInfo) {
    ssid = SSIDInfo[@"SSID"];
  }
  callback(@[[NSNull null], @{ @"SSID": ssid }]);
}

@end
