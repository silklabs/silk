#import "Silk-Swift.h"
#import "AppRCTConvert+NSData.h"

@implementation RCTConvert (AppRCTConvertNSData)

+ (NSData *)NSData:(id)json {

  // When NSData is a dictionary it is one of our special objects that JS references.
  if ([json isKindOfClass:[NSDictionary class]]) {
    NSString *blobID = json[@"id"];
    // The JSON Data is actually a dictionary...
    return [NSDataBridge release:blobID];
  }

  // Vanilla react-native case convert a string to NSData.
  return [[self NSString:json] dataUsingEncoding:NSUTF8StringEncoding];
}

@end