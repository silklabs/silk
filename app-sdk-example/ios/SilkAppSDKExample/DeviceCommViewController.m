//
//  DeviceCommViewController.m
//  SilkAppSDKExample
//
//  Created by Wayne Lee on 8/18/16.
//  Copyright © 2016 Silk Labs. All rights reserved.
//

#import "DeviceCommViewController.h"
#import "AppState.h"

@implementation DeviceCommViewController {
  AppState* appState;
  SLKAppSDKService *silkService;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  
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

  // Dispatch to main thread for snappy UI updates
  dispatch_async(dispatch_get_main_queue(), ^{
    self.statusText.text = status;
    self.logTextView.text = text;
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

  [appState updateStatus:@"Sent MESSAGE"];
}


@end
