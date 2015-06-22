
#ifndef Silk_BLECentral_h
#define Silk_BLECentral_h

#import <CoreBluetooth/CoreBluetooth.h>

#import "CBPeripheral+Extensions.h"
#import "RCTBridgeModule.h"

@interface BLECentral : NSObject <RCTBridgeModule, CBCentralManagerDelegate, CBPeripheralDelegate> {
  NSMutableDictionary* connectCallbacks;
  NSMutableDictionary* connectCallbackLatches;
  NSMutableDictionary* readCallbacks;
  NSMutableDictionary* writeCallbacks;
  NSMutableDictionary* notificationCallbacks;
  NSMutableDictionary* stopNotificationCallbacks;
}

@property (strong, nonatomic) NSMutableSet* peripherals;
@property (strong, nonatomic) CBCentralManager* manager;

- (void)startScan:(NSArray*)services;

- (void)stopScan;

- (void)connect:(NSString*)uuid callback:(RCTResponseSenderBlock)callback;

- (void)disconnect:(NSString*)uuid callback:(RCTResponseSenderBlock)callback;

- (void)read:(NSString*)deviceUuidStr service:(NSString*)serviceUuidStr characteristic:(NSString*)charcUuidStr
    callback:(RCTResponseSenderBlock)callback;

@end
  
#endif
