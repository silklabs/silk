#import <objc/runtime.h>

#import "RCTBridge.h"
#import "RCTEventDispatcher.h"

#import "SLKBlobManager.h"

#import "WebRTCModule+RTCDataChannel.h"

@implementation WebRTCModule (RTCDataChannel)

RCT_EXPORT_METHOD(createDataChannel:(nonnull NSNumber *)peerConnectionId
                              label:(NSString *)label
                             config:(RTCDataChannelInit *)config
{
  RTCPeerConnection *peerConnection = self.peerConnections[peerConnectionId];
  RTCDataChannel *dataChannel = [peerConnection createDataChannelWithLabel:label config:config];
  NSInteger dataChannelId = dataChannel.streamId;
  // XXX RTP data channels are not defined by the WebRTC standard, have been
  // deprecated in Chromium, and Google have decided (in 2015) to no longer
  // support them (in the face of multiple reported issues of breakages).
  if (-1 != dataChannelId) {
    self.dataChannels[@(dataChannelId)] = dataChannel;
    dataChannel.delegate = self;
  }
})

RCT_EXPORT_METHOD(dataChannelSend:(nonnull NSNumber *)dataChannelId
                             data:(NSString *)data
                             type:(NSString *)type
{
  RTCDataChannel *dataChannel = self.dataChannels[dataChannelId];
  NSData *bytes = [type isEqualToString:@"binary"] ?
    [[NSData alloc] initWithBase64EncodedString:data options:0] :
    [data dataUsingEncoding:NSUTF8StringEncoding];
  RTCDataBuffer *buffer = [[RTCDataBuffer alloc] initWithData:bytes isBinary:[type isEqualToString:@"binary"]];
  [dataChannel sendData:buffer];
})

RCT_EXPORT_METHOD(dataChannelClose:(nonnull NSNumber *)dataChannelId
{
  RTCDataChannel *dataChannel = self.dataChannels[dataChannelId];
  [dataChannel close];
  [self.dataChannels removeObjectForKey:dataChannelId];
})

RCT_EXPORT_METHOD(dataChannelSetBinaryType:(nonnull NSNumber *)dataChannelId binaryType:(NSString *)binaryType)
{
  [self.dataChannelBinaryTypeIsBlob setObject:@([binaryType isEqualToString:@"blob"]) forKey:dataChannelId];
}

- (NSString *)stringForDataChannelState:(RTCDataChannelState)state
{
  switch (state) {
    case kRTCDataChannelStateConnecting: return @"connecting";
    case kRTCDataChannelStateOpen: return @"open";
    case kRTCDataChannelStateClosing: return @"closing";
    case kRTCDataChannelStateClosed: return @"closed";
  }
  return nil;
}

#pragma mark - RTCDataChannelDelegate methods

// Called when the data channel state has changed.
- (void)channelDidChangeState:(RTCDataChannel*)channel
{
  NSDictionary *event = @{@"id": @(channel.streamId),
                          @"state": [self stringForDataChannelState:channel.state]};
  [self.bridge.eventDispatcher sendDeviceEventWithName:@"dataChannelStateChanged"
                                                  body:event];
}

// Called when a data buffer was successfully received.
- (void)channel:(RTCDataChannel*)channel didReceiveMessageWithBuffer:(RTCDataBuffer*)buffer
{
  NSString *type = @"text";
  id data;
  if (buffer.isBinary) {
    if ([self.dataChannelBinaryTypeIsBlob objectForKey:@(channel.streamId)]) {
      SLKBlobManager *blobManager = [[self bridge] moduleForClass:[SLKBlobManager class]];
      NSString *blobId = [blobManager store:buffer.data];
      data = @{
        @"blobId": blobId,
        @"offset": @0,
        @"size": @(buffer.data.length)
      };
      type = @"blob";
    } else {
      data = [buffer.data base64EncodedStringWithOptions:0];
      type = @"binary";
    }
  } else {
    data = [NSString stringWithUTF8String:buffer.data.bytes];
  }
  NSDictionary *event = @{@"id": @(channel.streamId),
                          @"type": type,
                          @"data": data};
  [self.bridge.eventDispatcher sendDeviceEventWithName:@"dataChannelReceiveMessage"
                                                  body:event];
}

@end
