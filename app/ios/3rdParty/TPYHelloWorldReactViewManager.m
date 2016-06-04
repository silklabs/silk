#import "TPYHelloWorldReactView.h"
#import "TPYHelloWorldReactViewManager.h"

#import "RCTBridge.h"
#import "RCTPicker.h"

@implementation TPYHelloWorldReactViewManager

RCT_EXPORT_MODULE()

- (UIView *)view
{
  return [TPYHelloWorldReactView new];
}

RCT_EXPORT_VIEW_PROPERTY(onButtonPress, RCTDirectEventBlock)

@end
