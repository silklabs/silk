/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "AppDelegate.h"
#import <SLKAppSDK/SLKAppSDK.h>

@interface AppDelegate () <SLKAppSDKDelegate>

@end

@implementation AppDelegate
{
  SLKAppSDKAPI *silk;
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  // Initialize Silk API
  silk = [[SLKAppSDKAPI alloc] initWithDelegate:self];

  // Override point for customization after application launch.
  return YES;
}

// SLKAppSDKDelegate methods

- (void)onMessage:(NSDictionary<NSString *, id> *)message {
  NSLog(@"Received message: %@", message);

  // Send the message right back.
  [silk postMessage:message];
}

@end
