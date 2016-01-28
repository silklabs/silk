#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(BlobManager, SLKBlobManager, NSObject)
RCT_EXTERN_METHOD(release:(NSString*)value)
@end
