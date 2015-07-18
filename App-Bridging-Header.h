#ifndef App_Bridging_Header_h
#define App_Bridging_Header_h

/**
This file allows Swift to interface directly with objc all interfaces that you want to
interface with via swift need to be imported here.
*/

#import "RCTRootView.h"
#import "RCTViewManager.h"
#import "RCTSparseArray.h"
#import "RCTUIManager.h"
#import "UIView+React.h"
#import "RCTViewNodeProtocol.h"
#import "RCTTouchHandler.h"
#import "RCTView.h"

// Bridge for socket.io bindings for swift
#import "node_modules/react-native-swift-socketio/RNSwiftSocketIO/SocketBridge.h"

#endif
