#import "RCTWebSocketModule.h"
#import "RCTSRWebSocket.h"

@interface RCTSRWebSocket (React)
- (nullable NSNumber *)reactTag;
@end

@interface RCTWebSocketModule (Silk)
- (void) close:(nonnull NSNumber *)socketID;
@end


@interface SLKWebSocketModule : RCTWebSocketModule
@end
