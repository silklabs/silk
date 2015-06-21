
#ifndef Silk_BLECentral_h
#define Silk_BLECentral_h

#import <CoreBluetooth/CoreBluetooth.h>

#import "CBPeripheral+Extensions.h"
#import "RCTBridgeModule.h"

@interface BLECentral : NSObject <RCTBridgeModule, CBCentralManagerDelegate, CBPeripheralDelegate> {
  NSMutableDictionary *connectCallbackLatches;
}

@property (strong, nonatomic) NSMutableSet* peripherals;
@property (strong, nonatomic) CBCentralManager* manager;

- (void)startScan:(NSArray*)services;

- (void)stopScan;

- (void)connect:(NSString*)uuid;

- (void)disconnect:(NSString*)uuid;

@end
  
#endif
