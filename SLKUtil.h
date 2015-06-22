
#ifndef Silk_SLKUtil_h
#define Silk_SLKUtil_h

#import "RCTBridgeModule.h"

@interface SLKUtil : NSObject <RCTBridgeModule>

- (void)getNetInfo:(RCTResponseSenderBlock)callback;

@end

#endif
