#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTViewManager.h"

@interface RCT_EXTERN_MODULE(ImageViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(blob, NSData)
@end
