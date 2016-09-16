#import "SLKUtil.h"

#import <Foundation/Foundation.h>
#import <SystemConfiguration/CaptiveNetwork.h>

#import "RCTBridge.h"

@implementation SLKUtil

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(genWifiInfo:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSArray *interfaceNames = CFBridgingRelease(CNCopySupportedInterfaces());
  NSLog(@"%s: Supported interfaces: %@", __func__, interfaceNames);

  for (NSString *interfaceName in interfaceNames) {
    NSDictionary *wifiInfo = CFBridgingRelease(CNCopyCurrentNetworkInfo((__bridge CFStringRef)interfaceName));
    NSLog(@"%s: %@ => %@", __func__, interfaceName, wifiInfo);
    if (wifiInfo.count > 0) {
      resolve(@{@"SSID": wifiInfo[@"SSID"],
                @"BSSID": wifiInfo[@"BSSID"]});
      return;
    }
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(exitApp) {
  // Not allowed to exit, so crash instead :-/
  @throw [NSException exceptionWithName:@"NotAllowedToExitException" reason:@"Attempted exit" userInfo:nil];
}

- (NSDictionary *)constantsToExport {

  return @{
    @"manufacturer": @"Apple",
    @"model": [[UIDevice currentDevice] model],
    @"name": [[UIDevice currentDevice] name],
    @"systemName": [[UIDevice currentDevice] systemName],
    @"systemVersion": [[UIDevice currentDevice] systemVersion]
  };
}

@end
