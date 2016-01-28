#import "RCTWebSocketModule.h"
#import "RCTSRWebSocket.h"

// See https://github.com/facebook/react-native/pull/5321
@interface RCTWebSocketModule () <RCTSRWebSocketDelegate>
@end

@interface SLKWebSocketModule : RCTWebSocketModule
@end
