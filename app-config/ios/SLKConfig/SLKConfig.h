#import "RCTBridgeModule.h"

@interface SLKConfig : NSObject<RCTBridgeModule>
@property (nonatomic, readonly) NSString *debug;
@property (nonatomic, readonly) NSURL *jsBundleURL;
@end
