//
//  DeviceCommViewController.m
//  SilkAppSDKExample
//
//  Created by Wayne Lee on 8/18/16.
//  Copyright © 2016 Silk Labs. All rights reserved.
//

#import <WebRTC/RTCEAGLVideoView.h>
#import <WebRTC/RTCVideoTrack.h>
#import "DeviceCommViewController.h"
#import "AppState.h"

@implementation DeviceCommViewController {
  AppState* appState;
  SLKAppSDKService *silkService;
  RTCEAGLVideoView *previewRenderer;
  BOOL addedPreviewRenderer;
}

- (void)viewDidLoad {
  [super viewDidLoad];

  previewRenderer = [[RTCEAGLVideoView alloc] init];
  previewRenderer.clipsToBounds = YES;
  [self.previewView addSubview:previewRenderer];
  previewRenderer.frame = self.previewView.bounds;
  addedPreviewRenderer = NO;

  self.title = [NSString stringWithFormat: @"Device Comms %@", self.deviceKey];
  
  appState = [AppState getInstance];
  silkService = appState.silkService;
  
  // Register to receive notifications to update this view
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(refreshView:) name:@"refreshView" object:nil];
  [self updateView];
}

- (void)refreshView:(NSNotification*) notification {
  [self updateView];
}

- (void) updateView {
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  NSString *status = [appState getStatus];
  NSArray* messages = [appState getMessagesFromDeviceId:deviceId];
  
  NSMutableString* text = [[NSMutableString alloc] init];
  
  for (id message in messages) {
    [text appendFormat:@"%@\n%@\n", message[@"direction"], message[@"payload"]];
  }

  NSString *togglePreviewButtonLabel;

  id previewStreamId = deviceInfo[@"rtcPreviewStreamId"];
  if (previewStreamId && previewStreamId != [NSNull null]) {
    togglePreviewButtonLabel = @"Disable Preview";

    if (!addedPreviewRenderer) {
      RTCMediaStream *stream = [silkService getMediaStreamForID:previewStreamId];
      if (stream && stream.videoTracks.count) {
        RTCVideoTrack *videoTrack = stream.videoTracks[0];
        [videoTrack addRenderer:previewRenderer];
        addedPreviewRenderer = YES;
      }
    }
  } else {
    togglePreviewButtonLabel = @"Enable Preview";
    addedPreviewRenderer = NO;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    self.statusText.text = status;
    self.logTextView.text = text;
    if (![_togglePreviewButton.currentTitle isEqualToString:togglePreviewButtonLabel]) {
      [_togglePreviewButton setTitle:togglePreviewButtonLabel forState:UIControlStateNormal];
    }
  });
}

- (IBAction)onSendEchoPress:(id)sender {
  NSString *msgType = @"DEVICE_MESSAGE";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  NSDictionary* echoMessage = @{@"command": @"echo", @"payload": @{@"message": @"Love the app"}};
  
  // TODO: postMessage can't handle a dictionary, so manually create a json string :(
  NSString *echoMessageStr = @"{\"command\": \"echo\", \"payload\": {\"message\": \"Love the app\"}}";
  
  NSLog(@"DeviceCommViewController: send %@ echo to %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId, @"payload": echoMessageStr}];

  // Add message so it can be displayed in the TextView
  [appState addDeviceMessage:echoMessage andDirection:@"sent" forDeviceId:deviceId];

  [appState updateStatus:@"Sent DEVICE_MESSAGE"];
}

- (IBAction)onTogglePreviewPress:(id)sender {
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *msgType;
  id previewStreamId = deviceInfo[@"rtcPreviewStreamId"];
  if (previewStreamId && previewStreamId != [NSNull null]) {
    msgType = @"DEVICE_RTC_PREVIEW_DISABLE";
  } else {
    msgType = @"DEVICE_RTC_PREVIEW_ENABLE";
  }
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceInfo[@"deviceId"]}];
  [appState updateStatus:[NSString stringWithFormat:@"Sent %@", msgType]];
}


@end
