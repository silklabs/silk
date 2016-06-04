#import "TPYHelloWorldDemoView.h"
#import "TPYHelloWorldReactView.h"

@implementation TPYHelloWorldDemoView

- (IBAction)onButtonTouchUpInside:(id)sender {
  // Simple example of how to pass data from native to React based on user
  // action. Here we pass a simple value (timestamp) back to React.
  TPYHelloWorldReactView *superView = (TPYHelloWorldReactView *)self.superview;
  superView.onButtonPress(@{
    @"timestampMs": @([[NSDate date] timeIntervalSince1970] * 1000)
  });
}

@end
