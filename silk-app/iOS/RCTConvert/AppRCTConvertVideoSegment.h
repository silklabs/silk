#import "Silk-Swift.h"
#import "RCTConvert.h"

@interface RCTConvert (AppRCTConvertVideoSegment)
typedef NSArray VideoSegmentArray;

+ (VideoSegment*)VideoSegment:(id)json;
+ (VideoSegmentArray*)VideoSegmentArray:(id)json;
@end
