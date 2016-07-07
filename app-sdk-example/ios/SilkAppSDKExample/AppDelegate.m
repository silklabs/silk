/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "AppDelegate.h"
#import "ViewController.h"
#import <SLKAppSDK/SLKAppSDK.h>

@interface AppDelegate () <SLKAppSDKDelegate>

@end

@implementation AppDelegate
{
  SLKAppSDKService *silkService;
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  // Initialize Silk API
  silkService = [[SLKAppSDKService alloc] initWithDelegate:self];

  UIStoryboard *storyBoard = [UIStoryboard storyboardWithName:@"Main" bundle:[NSBundle mainBundle]];
  ViewController *viewController = [storyBoard instantiateInitialViewController];
  viewController.silkService = silkService;

  // Set root view controller and make windows visible
  self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
  self.window.rootViewController = viewController;
  [self.window makeKeyAndVisible];

  // Override point for customization after application launch.
  return YES;
}

// SLKAppSDKDelegate methods

- (void)onMessage:(NSDictionary<NSString *, id> *)message {
  NSLog(@"Received message: %@", message);

  // Send the message right back.
  [silkService postMessage:message];
}

@end
