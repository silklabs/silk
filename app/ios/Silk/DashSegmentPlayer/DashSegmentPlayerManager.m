#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTInvalidating.h"
#import "RCTViewManager.h"
#import "RCTUIManager.h"

@interface RCT_EXTERN_MODULE(DashSegmentPlayerManager, RCTViewManager)

RCT_EXTERN_METHOD(play:(nonnull NSNumber*)reactTag)
RCT_EXTERN_METHOD(pause:(nonnull NSNumber*)reactTag)
RCT_EXTERN_METHOD(enqueue:(nonnull NSNumber*)reactTag segment:(VideoSegment *)segment)

@end
