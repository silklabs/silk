#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTInvalidating.h"
#import "RCTViewManager.h"
#import "RCTUIManager.h"

@interface RCT_EXTERN_MODULE(DashSegmentPlayerManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(onCanPlay, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPlay, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPause, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPlaying, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onWaiting, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTimeUpdate, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTDirectEventBlock)

RCT_EXTERN_METHOD(play:(nonnull NSNumber*)reactTag)
RCT_EXTERN_METHOD(pause:(nonnull NSNumber*)reactTag)
RCT_EXTERN_METHOD(enqueue:(nonnull NSNumber*)reactTag segment:(VideoSegment *)segment)

@end
