#import "RCTViewManager.h"
#import "RCTViewNodeProtocol.h"
#import "RCTView.h"
#import "RCTBridgeModule.h"

@interface RCT_EXTERN_MODULE(OverlayModalManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(orientation, NSString);
RCT_EXTERN_METHOD(show:(NSNumber *)reactTag
                  callback: (RCTResponseSenderBlock)callback)

RCT_EXTERN_METHOD(dismiss:(NSNumber *)reactTag
                  callback:(RCTResponseSenderBlock)callback)

@end
