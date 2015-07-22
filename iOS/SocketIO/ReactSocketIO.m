#import "RCTViewManager.h"
#import "RCTViewNodeProtocol.h"
#import "RCTView.h"
#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(SocketIO, ReactSocketIO, NSObject)

RCT_EXTERN_METHOD(connect:(NSString*)host config:(NSDictionary*)config)
RCT_EXTERN_METHOD(emit:event(NSString*) items:(NSArray*)items)
RCT_EXTERN_METHOD(disconnect)

@end