#import "TPYHelloWorldReactView.h"

#import "UIView+React.h"

/**
 * UIView that we manage through React. React-managed views don't get a
 * ViewController, the get a ViewManager. See TPYHelloWorldReactViewManager.
 *
 * We render a XIB-based view as our only subview.
 */
@implementation TPYHelloWorldReactView

- (instancetype)initWithFrame:(CGRect)frame
{
  if ((self = [super initWithFrame:frame])) {
    self.translatesAutoresizingMaskIntoConstraints = NO;
    UIView *view = [[NSBundle mainBundle] loadNibNamed:@"TPYHelloWorldDemoView"
                                                 owner:self
                                               options:nil][0];
    [self addSubview:view];
  }
  return self;
}

- (void)reactSetFrame:(CGRect)frame
{
  [super reactSetFrame:frame];

  // Simple example of how to pass data from native to React based on user
  // action. Here we pass a simple value (timestamp) back to React whenever
  // the button in the layout is pressed.
  UIView *subView = [self subviews][0];
  subView.frame = CGRectMake(0, 0, CGRectGetWidth(frame), CGRectGetHeight(frame));
}

@end
