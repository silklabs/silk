/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import <Foundation/Foundation.h>

#import "AppState.h"

@implementation AppState {
  NSString *_status;
  NSString *_connectionStatus;
  NSString *_connectionError;
  NSString *_authStatus;
  NSString *_authError;
  
  NSMutableDictionary* _devices;        // Stores deviceStatus for easy access
  NSArray *_devicesArray;               // Stores deviceStatus for device list table in UI
  NSMutableDictionary* _wifiNetworks;   // Stores wifiNetworks seen by each device
  NSMutableDictionary* _deviceMessages; // Stores devices messages sent and received
  
  NSString* _lock;
}

static AppState *singletonInstance;

+ (AppState*) getInstance{
  if (singletonInstance == nil) {
    singletonInstance = [[super alloc] init];
  }
  return singletonInstance;
}

- (id)init
{
  self = [super init];
  if (self)
  {
    _status = @"";
    _connectionStatus = @"";
    _connectionError = @"";
    _authStatus = @"";
    _authError = @"";
    
    _devices = [[NSMutableDictionary alloc] init];
    _devicesArray = [[NSMutableArray alloc] init];
    _wifiNetworks = [[NSMutableDictionary alloc] init];
    _deviceMessages = [[NSMutableDictionary alloc] init];
    
    _lock = @"lock";
  }
  return self;
}

// Send message to views to refresh itself
-(void)updateView {
  [[NSNotificationCenter defaultCenter] postNotificationName:@"refreshView" object:nil];
}

-(void) updateStatus: (NSString*) status {
  _status = status;
  [self updateView];
}

-(void) updateConnectionStatus: (NSString*) connectionStatus andConnectionError:(NSString*) connectionError andAuthStatus:(NSString*) authStatus andAuthError:(NSString*) authError {
  _connectionStatus = ![connectionStatus isKindOfClass:[NSString class]] ? @"" : connectionStatus;
  _connectionError = ![connectionError isKindOfClass:[NSString class]] ? @"" : connectionError;
  _authStatus = ![authStatus isKindOfClass:[NSString class]] ? @"" : authStatus;
  _authError = ![authError isKindOfClass:[NSString class]] ? @"" : authError;
  [self updateView];
}

-(void) updateDevices: (NSArray*) devices {

  @synchronized(_lock) {
    // Temp arrays to store devices based on type
    NSMutableArray* tempDevicesArray = [[NSMutableArray alloc] init];
    NSMutableArray* tempConfigDevicesArray = [[NSMutableArray alloc] init];

    for (id deviceStatus in devices) {
      NSString *deviceConfigStatus = deviceStatus[@"deviceConfigStatus"];
      
      if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
        [tempDevicesArray addObject:deviceStatus];
      } else {
        [tempConfigDevicesArray addObject:deviceStatus];
      }
      
      // Keep deviceStatus in dictionary for easy access, key off of both deviceConfigId and
      // deviceId as they can be indexed both ways as their state changes
      NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
      NSString *deviceId = deviceStatus[@"deviceId"];
      if (![deviceConfigId isKindOfClass:[NSNull class]]) {
        NSLog(@"AppState: Adding device using deviceConfigId (%@) %@", deviceConfigId, deviceStatus);
        _devices[[deviceConfigId stringValue]] = deviceStatus;
      }
      if (![deviceId isKindOfClass:[NSNull class]]) {
        NSLog(@"AppState: Adding device using deviceId (%@) %@", deviceId, deviceStatus);
        _devices[deviceId] = deviceStatus;
      }
    }
  
    _devicesArray = [tempConfigDevicesArray arrayByAddingObjectsFromArray:tempDevicesArray];

    // clean up the wifiNetwork list as devices may have been removed.
    // remove wifiNetworks for keys that aren't in _devices
    NSArray *deviceKeys = [_devices allKeys];
    for (id wifiDeviceKey in [_wifiNetworks allKeys]) {
      if (![deviceKeys containsObject:wifiDeviceKey]) {
        NSLog(@"AppState: Removing wifiNetwork for %@", wifiDeviceKey);
        [_wifiNetworks removeObjectForKey:wifiDeviceKey];
      }
    }
  }
  [self updateView];
}

-(void) updateWifiNetworks: (NSArray*) wifiNetworks forDeviceKey:(NSString*) deviceKey {
  NSLog(@"AppState: Adding wifiNetwork for %@", deviceKey);
  @synchronized(_lock) {
    _wifiNetworks[deviceKey] = wifiNetworks;
  }
  [self updateView];
}

-(void) addDeviceMessage: (NSDictionary*) payload andDirection: (NSString*) direction forDeviceId: (NSString*) deviceId {
  NSDictionary *message = @{@"payload": payload, @"direction": direction};
  NSMutableArray *messages = [_deviceMessages objectForKey: deviceId];

  if (!messages) {
    // Create initial message array for this deviceId
    messages = [[NSMutableArray alloc] init];
    _deviceMessages[deviceId] = messages;
  }

  @synchronized(_lock) {
    [messages insertObject:message atIndex:0]; // keep newest up top
  }
  
  [self updateView];
}

-(NSString*) getDeviceKeyFromDeviceStatus: (NSDictionary*) deviceStatus {
  NSString *deviceConfigStatus = deviceStatus[@"deviceConfigStatus"];
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  NSString *deviceId = deviceStatus[@"deviceId"];
  
  if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
    return deviceId;
  } else {
    return [deviceConfigId stringValue];
  }
}

-(NSString*) getStatus {
  return _status;
}

-(NSString*) getConnectionStatus {
  return _connectionStatus;
}

-(NSString*) getConnectionError {
  return _connectionError;
}

-(NSString*) getAuthStatus {
  return _authStatus;
}

-(NSString*) getAuthError {
  return _authError;
}

-(NSArray*) getDevicesArray {
  return _devicesArray;
}

-(NSDictionary*) getDeviceStatusFromDeviceKey: (NSString*) deviceKey {
  return _devices[deviceKey];
}

-(NSArray*) getWifiNetworksFromDeviceKey:(NSString*) deviceKey {
  NSArray* wifiNetworks = [_wifiNetworks objectForKey: deviceKey];
  if (!wifiNetworks) {
    wifiNetworks = [[NSArray alloc] init];
  }
  return wifiNetworks;
}

-(NSArray*) getMessagesFromDeviceId:(NSString*) deviceId {
  NSArray* messages = [_deviceMessages objectForKey: deviceId];
  if (!messages) {
    messages = [[NSArray alloc] init];
  }
  return messages;
}

@end