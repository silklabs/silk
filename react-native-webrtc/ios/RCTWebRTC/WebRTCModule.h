//
//  WebRTCModule.h
//
//  Created by one on 2015/9/24.
//  Copyright © 2015 One. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

#import "RCTBridgeModule.h"
#import "RCTConvert.h"

#import <WebRTC/RTCDataChannel.h>
#import <WebRTC/RTCMediaStream.h>
#import <WebRTC/RTCPeerConnectionFactory.h>
#import <WebRTC/RTCPeerConnection.h>
#import <WebRTC/RTCAudioTrack.h>
#import <WebRTC/RTCVideoTrack.h>

@interface WebRTCModule : NSObject <RCTBridgeModule>

@property (nonatomic, strong) RTCPeerConnectionFactory *peerConnectionFactory;

@property (nonatomic, strong) NSMutableDictionary<NSNumber *, RTCPeerConnection *> *peerConnections;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, RTCMediaStream *> *mediaStreams;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, RTCMediaStreamTrack *> *tracks;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, RTCDataChannel *> *dataChannels;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSNumber *> *dataChannelBinaryTypeIsBlob;
@property (nonatomic) NSInteger mediaStreamId;
@property (nonatomic) NSInteger trackId;

@end
