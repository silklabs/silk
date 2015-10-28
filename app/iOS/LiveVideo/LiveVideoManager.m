#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTInvalidating.h"
#import "RCTViewManager.h"
#import "RCTUIManager.h"

@interface RCT_EXTERN_MODULE(LiveVideoManager, RCTViewManager)

RCT_EXTERN_METHOD(play:(nonnull NSNumber*)reactTag)
RCT_EXTERN_METHOD(pause:(nonnull NSNumber*)reactTag)

RCT_EXPORT_VIEW_PROPERTY(rate, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(willPlay, BOOL)
// VideoSegmentArray is defined by the RCTConversion category for VideoSegment.
RCT_EXPORT_VIEW_PROPERTY(segments, VideoSegmentArray)

@end
