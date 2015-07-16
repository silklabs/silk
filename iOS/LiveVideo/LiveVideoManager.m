#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTInvalidating.h"
#import "RCTViewManager.h"
#import "RCTUIManager.h"

@interface RCT_EXTERN_MODULE(LiveVideoManager, RCTViewManager)


RCT_EXTERN_METHOD(destroy:(NSNumber *)reactTag)
RCT_EXPORT_VIEW_PROPERTY(videoStream, NSDictionary)

@end
