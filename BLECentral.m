#import "BLECentral.h"

#import <Foundation/Foundation.h>

#import "RCTBridge.h"
#import "RCTEventDispatcher.h"
#import "RCTUtils.h"

//#define VERBOSE 1

@interface BLECentral()
- (CBPeripheral *)findPeripheralByUUID:(NSString *)uuid;
- (void)emitConnectionEvent:(NSString*)uuid peripheral:(CBPeripheral*)peripheral type:(NSString*)type msg:(NSString*)msg;
@end

@implementation BLECentral

RCT_EXPORT_MODULE();

@synthesize bridge = _bridge;
@synthesize manager;
@synthesize peripherals;

- (instancetype)init
{
  if ((self = [super init])) {
    NSLog(@"BLECentral:init");
    
    peripherals = [NSMutableSet set];
    manager = [[CBCentralManager alloc] initWithDelegate:self queue:nil];
    connectCallbackLatches = [NSMutableDictionary new];
  }
  return self;
}

- (void)dealloc
{
  NSLog(@"BLECentral:dealloc");
}

RCT_EXPORT_METHOD(startScan:(NSArray*)services) {
  NSLog(@"BLECentral:startScan: %lu services", (unsigned long)[services count]);

  NSMutableArray *serviceUUIDs = [NSMutableArray new];
  for (id service in services) {
    NSLog(@"  service: %@", service);
    CBUUID *serviceUUID =[CBUUID UUIDWithString:service];
    [serviceUUIDs addObject:serviceUUID];
  }
  [manager scanForPeripheralsWithServices:serviceUUIDs options:nil];
}

RCT_EXPORT_METHOD(stopScan) {
  NSLog(@"BLECentral:stopScan");

  [manager stopScan];
}

RCT_EXPORT_METHOD(connect:(NSString*)uuid) {
  NSLog(@"BLECentral:connect %@", uuid);

  CBPeripheral *peripheral = [self findPeripheralByUUID:uuid];
  if (!peripheral) {
    [self emitConnectionEvent:uuid peripheral:peripheral type:@"error" msg:@"Unknown peripheral"];
    return;
  }
  [manager connectPeripheral:peripheral options:nil];
}

RCT_EXPORT_METHOD(disconnect:(NSString*)uuid) {
  NSLog(@"BLECentral:disconnect %@", uuid);
  
  CBPeripheral *peripheral = [self findPeripheralByUUID:uuid];
  if (!peripheral) {

    return;
  }
  if (peripheral.isConnected) {
    [manager cancelPeripheralConnection:peripheral];
  }
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral   advertisementData:(NSDictionary *)advertisementData RSSI:(NSNumber *)RSSI {
  NSLog(@"BLECentral:didDiscoverPeripheral %@", [peripheral asDictionary]);

  [peripherals addObject:peripheral];
  [peripheral setAdvertisementData:advertisementData RSSI:RSSI];
  [self.bridge.eventDispatcher sendDeviceEventWithName:@"ble:peripheralDiscovered" body:[peripheral asDictionary]];
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
  NSLog(@"BLECentral: CBCentralManager status changed to: %ld %@",
        central.state, [self centralManagerStateToString: central.state]);
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
  NSLog(@"BLECentral:didConnectPeripheral");
  
  peripheral.delegate = self;
  // TODO: it's inefficient to discover all services
  [peripheral discoverServices:nil];
  // NB: not calling connect success until characteristics are discovered
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  NSLog(@"BLECentral:didDisconnectPeripheral");

  [self emitConnectionEvent:peripheral.uuidAsString peripheral:peripheral type:@"disconnect" msg:@"Connected"];
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  NSLog(@"BLECentral:didFailToConnectPeripheral");
  
  [self emitConnectionEvent:peripheral.uuidAsString peripheral:peripheral type:@"error" msg:@"Failed to connect peripheral"];
}

#pragma mark CBPeripheralDelegate

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error {
  NSLog(@"BLECentral:didDiscoverServices");
  
  // save the services to tell when all characteristics have been discovered
  NSMutableSet *servicesForPeriperal = [NSMutableSet new];
  [servicesForPeriperal addObjectsFromArray:peripheral.services];
  
  for (CBService *service in peripheral.services) {
    [peripheral discoverCharacteristics:nil forService:service]; // discover all is slow
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error {
  NSLog(@"BLECentral:didDiscoverCharacteristicsForService %@", service);
#ifdef VERBOSE
  for (CBCharacteristic *characteristic in service.characteristics) {
    NSLog(@"    characteristic %@", characteristic);
  }
#endif//

  NSString *peripheralUUIDString = [peripheral uuidAsString];
  NSMutableSet *latch = [connectCallbackLatches valueForKey:peripheralUUIDString];
  [latch removeObject:service];
  if ([latch count] == 0) {
    // Call success callback for connect
    [self emitConnectionEvent:peripheral.uuidAsString peripheral:peripheral type:@"connect" msg:@"Connected"];
    [connectCallbackLatches removeObjectForKey:peripheralUUIDString];
  }
}

#pragma mark - internal implemetation

- (CBPeripheral*)findPeripheralByUUID:(NSString*)uuid {
  for (CBPeripheral *p in peripherals) {
    NSString* other = CFBridgingRelease(CFUUIDCreateString(nil, p.UUID));
    if ([uuid isEqualToString:other]) {
      return p;
    }
  }
  return nil;
}

- (void)emitConnectionEvent:(NSString*)uuid peripheral:(CBPeripheral*)peripheral type:(NSString*)type msg:(NSString*)msg {
  [self.bridge.eventDispatcher sendDeviceEventWithName:@"ble:peripheralConnectionChange"
                                                  body:@{@"type": type,
                                                         @"peripheral": peripheral ? [peripheral asDictionary] : @"",
                                                         @"uuid": uuid,
                                                         @"msg": @"Unknown peripheral"}];
}

#pragma mark - util

- (NSString*) centralManagerStateToString: (int)state
{
  switch(state)
  {
    case CBCentralManagerStateUnknown:
      return @"State unknown (CBCentralManagerStateUnknown)";
    case CBCentralManagerStateResetting:
      return @"State resetting (CBCentralManagerStateUnknown)";
    case CBCentralManagerStateUnsupported:
      return @"State BLE unsupported (CBCentralManagerStateResetting)";
    case CBCentralManagerStateUnauthorized:
      return @"State unauthorized (CBCentralManagerStateUnauthorized)";
    case CBCentralManagerStatePoweredOff:
      return @"State BLE powered off (CBCentralManagerStatePoweredOff)";
    case CBCentralManagerStatePoweredOn:
      return @"State powered up and ready (CBCentralManagerStatePoweredOn)";
    default:
      return @"State unknown";
  }
  
  return @"Unknown state";
}

@end
