/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#ifndef AppState_h
#define AppState_h

#import <SLKAppSDK/SLKAppSDK.h>

@interface AppState : NSObject {
  NSString *info;
}

@property (nonatomic) SLKAppSDKService *silkService;

+(AppState*) getInstance;

-(void) updateStatus: (NSString*) status;
-(void) updateConnectionStatus: (NSString*) connectionStatus andConnectionError:(NSString*) connectionError andAuthStatus:(NSString*) authStatus andAuthError:(NSString*) authError;
-(void) updateDevices: (NSArray*) devices;
-(void) updateDeviceStatus: (NSDictionary*) deviceStatus;
-(void) updateClients: (NSArray*) clients;
-(void) updateBleRequested: (NSNumber*) bleRequested forDeviceKey:(NSString*) deviceKey;
-(void) updateUpdateStatus: (NSDictionary*) updateStatus;
-(void) updateConnectionDetails: (NSDictionary*) connectionDetails;
-(void) updateWifiNetworks: (NSArray*) wifiNetworks forDeviceKey:(NSString*) deviceKey;
-(void) addDeviceMessage: (NSDictionary*) payload andDirection: (NSString*) direction forDeviceId: (NSString*) deviceId;
-(void) updateView;

// TODO. maybe turn these into properties.
-(NSString*) getStatus;
-(NSString*) getConnectionStatus;
-(NSString*) getConnectionError;
-(NSString*) getAuthStatus;
-(NSString*) getAuthError;
-(NSArray*) getDevicesClientsArray;
-(NSDictionary*) getDeviceInfoFromDeviceKey: (NSString*) deviceKey;
-(NSDictionary*) getClientFromClientId: (NSString*) clientId;
-(NSArray*) getWifiNetworksFromDeviceKey:(NSString*) deviceKey;
-(NSArray*) getMessagesFromDeviceId:(NSString*) deviceId;

@end

#endif /* AppState_h */
