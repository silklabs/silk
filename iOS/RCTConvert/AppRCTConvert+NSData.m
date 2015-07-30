#import "Silk-Swift.h"
#import "AppRCTConvert+NSData.h"

@implementation RCTConvert (AppRCTConvertNSData)

+ (NSData *)NSData:(id)json
{
  if ([json isKindOfClass:[NSDictionary class]]) {
    NSString *blobID = json[@"id"];
    // The JSON Data is actually a dictionary...
    return [NSDataBridge release:blobID];
  }
  return NULL;

}

@end
