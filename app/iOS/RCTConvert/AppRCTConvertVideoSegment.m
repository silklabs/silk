#import "AppRCTConvertVideoSegment.h"

@implementation RCTConvert (AppRCTConvertVideoSegment)

+ (VideoSegment *)VideoSegment:(id)json {
  // When NSData is a dictionary it is one of our special objects that JS references.
  if ([json isKindOfClass:[NSDictionary class]]) {
    return [VideoSegment fromJSON:json];
  }

  return NULL;
}

RCT_ARRAY_CONVERTER(VideoSegment)

@end
