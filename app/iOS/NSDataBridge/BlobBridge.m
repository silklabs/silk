#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(BlobBridge, NSDataBridge, NSObject)
RCT_EXTERN_METHOD(release:(NSString*)value)
@end
