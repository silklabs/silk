
#ifndef Silk_BLECentral_h
#define Silk_BLECentral_h

#import <CoreBluetooth/CoreBluetooth.h>

#import "RCTBridgeModule.h"

@interface BLECentral : NSObject <RCTBridgeModule, CBCentralManagerDelegate, CBPeripheralDelegate>

- (void)startScan:(NSString*)command;

@end
  
#endif
