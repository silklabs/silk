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

-(void) _updateDeviceStatus: (NSDictionary*) deviceStatus {
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  NSString *deviceId = deviceStatus[@"deviceId"];
  NSMutableDictionary* deviceInfo;
  
  // Use previous deviceInfo if exists, else create one.
  if (![deviceId isKindOfClass:[NSNull class]] && [_devices objectForKey:deviceId]) {
    deviceInfo = _devices[deviceId];
  } else if (![deviceConfigId isKindOfClass:[NSNull class]] && [_devices objectForKey:[deviceConfigId stringValue]]) {
    deviceInfo = _devices[[deviceConfigId stringValue]];
  } else {
    deviceInfo = [[NSMutableDictionary alloc] init];
  }
  
  // Update info from deviceStatus
  deviceInfo[@"deviceType"] = deviceStatus[@"deviceType"];
  deviceInfo[@"deviceId"] = deviceStatus[@"deviceId"];
  deviceInfo[@"accountDeviceNumber"] = deviceStatus[@"accountDeviceNumber"];
  deviceInfo[@"deviceConfigId"] = deviceStatus[@"deviceConfigId"];
  deviceInfo[@"deviceConfigStatus"] = deviceStatus[@"deviceConfigStatus"];
  deviceInfo[@"serverConnectionStatus"] = deviceStatus[@"serverConnectionStatus"];
  deviceInfo[@"bleConnectionStatus"] = deviceStatus[@"bleConnectionStatus"];
  deviceInfo[@"bleConnectionError"] = deviceStatus[@"bleConnectionError"];
  deviceInfo[@"rtcConnectionStatus"] = deviceStatus[@"rtcConnectionStatus"];
  deviceInfo[@"rtcConnectionError"] = deviceStatus[@"rtcConnectionError"];

  // If ble channel is not connected, the wifi and connection details are invalid, clear them
  // TODO: move wifi channel info in here and remove.
  if (![deviceInfo[@"bleConnectionStatus"] isEqualToString: @"CONNECTED"]) {
    deviceInfo[@"wifiStatus"] = [[NSNull alloc] init];
    deviceInfo[@"wifiSSID"] = [[NSNull alloc] init];
    deviceInfo[@"wifiLevel"] = [[NSNull alloc] init];
    deviceInfo[@"wifiError"] = [[NSNull alloc] init];
    deviceInfo[@"serverStatus"] = [[NSNull alloc] init];
    deviceInfo[@"serverError"] = [[NSNull alloc] init];
    
    deviceInfo[@"updateState"]  = [[NSNull alloc] init];
    deviceInfo[@"updateError"]  = [[NSNull alloc] init];
    deviceInfo[@"updateDownloadRemainingSec"]  = [[NSNull alloc] init];
  }
  
  // Keep deviceStatus in dictionary for easy access, key off of both deviceConfigId and
  // deviceId as they can be indexed both ways as their state changes
  if (![deviceConfigId isKindOfClass:[NSNull class]]) {
    NSLog(@"AppState: Adding device using deviceConfigId (%@) %@", deviceConfigId, deviceInfo);
    _devices[[deviceConfigId stringValue]] = deviceInfo;
  }
  if (![deviceId isKindOfClass:[NSNull class]]) {
    NSLog(@"AppState: Adding device using deviceId (%@) %@", deviceId, deviceInfo);
    _devices[deviceId] = deviceInfo;
  }
}

-(void) updateDevices: (NSArray*) devices {
  // Temp arrays to store devices based on type
  NSMutableArray* tempDevicesArray = [[NSMutableArray alloc] init];
  NSMutableArray* tempConfigDevicesArray = [[NSMutableArray alloc] init];

  @synchronized(_lock) {
    for (id deviceStatus in devices) {
      NSString *deviceConfigStatus = deviceStatus[@"deviceConfigStatus"];
      NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
      NSString *deviceId = deviceStatus[@"deviceId"];
      
      if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
        [tempDevicesArray addObject:deviceId];
      } else {
        [tempConfigDevicesArray addObject:[deviceConfigId stringValue]];
      }

      [self _updateDeviceStatus:deviceStatus];
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

-(void) updateDeviceStatus: (NSDictionary*) deviceStatus {
  @synchronized (_lock) {
    [self _updateDeviceStatus: deviceStatus];
  }
  [self updateView];
}

-(void) updateUpdateStatus: (NSDictionary*) updateStatus {
  @synchronized (_lock) {
    NSString *deviceId = updateStatus[@"deviceId"];
    NSDictionary* progress = updateStatus[@"progress"];
    NSMutableDictionary* deviceInfo = _devices[deviceId];

    deviceInfo[@"updateState"] = updateStatus[@"state"];
    deviceInfo[@"updateError"] = updateStatus[@"error"];
    deviceInfo[@"updateDownloadRemainingSec"] = ![progress isKindOfClass:[NSDictionary class]] ? @"" : progress[@"remainingSec"];
  }
  [self updateView];
}

-(void) updateConnectionDetails:(NSDictionary *) connectionDetails {
  @synchronized (_lock) {
    NSString *deviceId = connectionDetails[@"deviceId"];
    NSMutableDictionary* deviceInfo = _devices[deviceId];

    deviceInfo[@"wifiStatus"] = connectionDetails[@"wifiStatus"];
    deviceInfo[@"wifiSSID"] = connectionDetails[@"wifiSSID"];
    deviceInfo[@"wifiLevel"] = connectionDetails[@"wifiLevel"];
    deviceInfo[@"wifiError"] = connectionDetails[@"wifiError"];
    deviceInfo[@"serverStatus"] = connectionDetails[@"serverStatus"];
    deviceInfo[@"serverError"]= connectionDetails[@"serverError"];
  }
  [self updateView];
}

-(void) updateBleRequested: (NSNumber*) bleRequested forDeviceKey:(NSString*) deviceKey {
  @synchronized (_lock) {
    NSMutableDictionary* deviceInfo = _devices[deviceKey];
    deviceInfo[@"bleRequested"] = bleRequested;
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

-(NSDictionary*) getDeviceInfoFromDeviceKey: (NSString*) deviceKey {
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
