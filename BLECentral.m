
#import <Foundation/Foundation.h>

#import "BLECentral.h"

@implementation BLECentral

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(startScan:(NSString*)command) {
  
  NSLog(@"startScan %@", command);

}

@end
