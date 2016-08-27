/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "AppDelegate.h"
#import "ViewController.h"
#import "AppState.h"
#import <SLKAppSDK/SLKAppSDK.h>

@interface AppDelegate () <SLKAppSDKDelegate>
@end

@implementation AppDelegate
{
  SLKAppSDKService *silkService;
  AppState* appState;
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {

  // Initilize the global App state
  appState = [AppState getInstance];
  
  // Initialize Silk API
  silkService = [[SLKAppSDKService alloc] initWithDelegate:self];
  appState.silkService = silkService;

  UIStoryboard *storyBoard = [UIStoryboard storyboardWithName:@"Main" bundle:[NSBundle mainBundle]];
  ViewController *viewController = [storyBoard instantiateInitialViewController];

  // Set root view controller and make windows visible
  self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
  self.window.rootViewController = viewController;
  [self.window makeKeyAndVisible];

  // Override point for customization after application launch.
  return YES;
}

- (void)applicationDidBecomeActive:(UIApplication *)application {
  [silkService applicationDidBecomeActive];
}

- (void)applicationDidEnterBackground:(UIApplication *)application {
  [silkService applicationDidEnterBackground];
}

// SLKAppSDKDelegate methods
- (void)onMessage:(NSDictionary<NSString *, id> *)message {
  NSLog(@"Received message from SDK: %@", message);
  NSString *messageType = message[@"type"];
  
  if ([messageType isEqualToString: @"INITIALIZED"]) {
    // SDK is initialized
    [appState updateStatus:messageType];

  } else if ([messageType isEqualToString: @"CLIENT_STATUS"]) {
    // Client status has changed
    NSString *connectionStatus = message[@"clientConnectionStatus"];
    NSString *connectionError = message[@"clientConnectionError"];
    NSString *authStatus = message[@"clientAuthStatus"];
    NSString *authError = message[@"clientAuthError"];
    
    [appState updateConnectionStatus:connectionStatus andConnectionError:connectionError andAuthStatus:authStatus andAuthError:authError];

  } else if ([messageType isEqualToString: @"DEVICE_LIST"]) {
    // Device list/status has changed
    NSArray *devices = message[@"devices"];
    [appState updateDevices:devices];

  } else if ([messageType isEqualToString: @"DEVICE_STATUS"]) {
    // Device status has changed
    [appState updateDeviceStatus:message];

  } else if ([messageType isEqualToString: @"DEVICE_UPDATE_STATUS"]) {
    // Device update status has changed
    [appState updateUpdateStatus:message];

  } else if ([messageType isEqualToString: @"DEVICE_CONNECTION_DETAILS"]) {
    // Device connection details has changed
    [appState updateConnectionDetails:message];

  } else if ([messageType isEqualToString: @"DEVICE_CONFIG_WIFI_NETWORKS"]) {
    // Received updated Wifi network info for a specific device
    NSNumber *deviceConfigId = message[@"deviceConfigId"];
    NSArray *wifiNetworks = message[@"wifiNetworks"];
    NSString *deviceKey = [deviceConfigId stringValue];
    [appState updateWifiNetworks:wifiNetworks forDeviceKey:deviceKey];

  } else if ([messageType isEqualToString: @"DEVICE_CONFIG_SUCCESS"]) {
    // Device configuration is successful
    NSNumber *deviceConfigId = message[@"deviceConfigId"];
    NSString *status = [NSString stringWithFormat:@"Config success (%@)", deviceConfigId];
    [appState updateStatus:status];
    
  } else if ([messageType isEqualToString: @"DEVICE_CONFIG_ERROR"]) {
    // Device configuration failed
    NSNumber *deviceConfigId = message[@"deviceConfigId"];
    NSString *configError = message[@"configError"];
    NSString *status = [NSString stringWithFormat:@"Config failed (%@): %@", deviceConfigId, configError];
    [appState updateStatus:status];

  } else if ([messageType isEqualToString: @"DEVICE_CONFIG_FATAL_ERROR"]) {
    // Device configuration failed
    NSNumber *deviceConfigId = message[@"deviceConfigId"];
    NSString *configFatalError = message[@"configFatalError"];
    NSString *status = [NSString stringWithFormat:@"Config fatal error (%@): %@", deviceConfigId, configFatalError];
    [appState updateStatus:status];

  } else if ([messageType isEqualToString: @"DEVICE_WIFI_NETWORKS"]) {
    // Received updated Wifi network during Wi-Fi reconfiguration
    NSString *deviceId = message[@"deviceId"];
    NSArray *wifiNetworks = message[@"wifiNetworks"];
    [appState updateWifiNetworks:wifiNetworks forDeviceKey:deviceId];

  } else if ([messageType isEqualToString: @"DEVICE_MESSAGE"]) {
    // SDK received a message from a device
    NSDictionary *payload = message[@"payload"];
    NSString *deviceId = message[@"deviceId"];
    [appState addDeviceMessage:payload andDirection:@"received" forDeviceId:deviceId];

  } else if ([messageType isEqualToString: @"DEVICE_MESSAGE_ERROR"]) {
    // bad device message
    NSString *error = message[@"error"];
    NSString *status = [NSString stringWithFormat:@"%@: error: %@", messageType, error];
    [appState updateStatus:status];

  } else if ([messageType isEqualToString: @"MESSAGE_ERROR"]) {
    // SDK received a bad message
    NSString *error = message[@"error"];
    NSString *badMessage = message[@"message"][@"type"];
    NSString *status = [NSString stringWithFormat:@"%@: %@, messageType: %@", messageType, error, badMessage];
    [appState updateStatus:status];

  } else {
    // Received a message that this function is not expecting
    NSString *status = [NSString stringWithFormat:@"Unhandled message: %@", messageType];
    [appState updateStatus:status];
  }
}

@end
