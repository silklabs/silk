#import "BLECentral.h"

#import <Foundation/Foundation.h>

#import "RCTBridge.h"
#import "RCTEventDispatcher.h"
#import "RCTUtils.h"

//#define SUPER_VERBOSE 1
#if 0
#  define BLE_LOG(...) BLE_LOG(__VA_ARGS__)
#else
#  define BLE_LOG(...) ((void)0)
#endif

@interface BLEPeriphCharc : NSObject
@property CBPeripheral *peripheral;
@property CBCharacteristic *characteristic;
@end

@implementation BLEPeriphCharc
@end

@interface BLECentral()
- (CBPeripheral*)findPeripheralByUUID:(NSString *)uuid;
- (BLEPeriphCharc*)getPeriphCharc:(NSString*)deviceUuidStr service:(NSString*)serviceUuidStr characteristic:(NSString*)charcUuidStr;
@end

@implementation BLECentral

RCT_EXPORT_MODULE();

@synthesize bridge = _bridge;
@synthesize manager;
@synthesize peripherals;

- (instancetype)init
{
  if ((self = [super init])) {
    BLE_LOG(@"BLECentral:init");
    
    peripherals = [NSMutableSet set];
    manager = [[CBCentralManager alloc] initWithDelegate:self queue:nil];
    connectCallbacks = [NSMutableDictionary new];
    connectCallbackLatches = [NSMutableDictionary new];
    readCallbacks = [NSMutableDictionary new];
    writeCallbacks = [NSMutableDictionary new];
    notificationCallbacks = [NSMutableDictionary new];
    stopNotificationCallbacks = [NSMutableDictionary new];
  }
  return self;
}

- (void)dealloc
{
  BLE_LOG(@"BLECentral:dealloc");
}

RCT_EXPORT_METHOD(startScan:(NSArray*)services) {
  BLE_LOG(@"BLECentral:startScan: %lu services", (unsigned long)[services count]);

  NSMutableArray *serviceUUIDs = [NSMutableArray new];
  for (id service in services) {
    BLE_LOG(@"  service: %@", service);
    CBUUID *serviceUUID =[CBUUID UUIDWithString:service];
    [serviceUUIDs addObject:serviceUUID];
  }
  [manager scanForPeripheralsWithServices:serviceUUIDs options:nil];
}

RCT_EXPORT_METHOD(stopScan) {
  BLE_LOG(@"BLECentral:stopScan");

  [manager stopScan];
}

RCT_EXPORT_METHOD(connect:(NSString*)uuid callback:(RCTResponseSenderBlock)callback) {
  BLE_LOG(@"BLECentral:connect %@", uuid);

  CBPeripheral *peripheral = [self findPeripheralByUUID:uuid];
  if (!peripheral) {
    callback(@[@{ @"error": @"Unknown peripheral", @"uuid": uuid }, [NSNull null]]);
    return;
  }
  [connectCallbacks setObject:callback forKey:[peripheral uuidAsString]];
  [manager connectPeripheral:peripheral options:nil];
}

RCT_EXPORT_METHOD(disconnect:(NSString*)uuid callback:(RCTResponseSenderBlock)callback) {
  BLE_LOG(@"BLECentral:disconnect %@", uuid);
  
  CBPeripheral *peripheral = [self findPeripheralByUUID:uuid];
  if (!peripheral) {

    return;
  }
  if (peripheral.isConnected) {
    [manager cancelPeripheralConnection:peripheral];
  }
  callback(@[[NSNull null], [NSNull null]]);
}

RCT_EXPORT_METHOD(read:(NSString*)deviceUuidStr service:(NSString*)serviceUuidStr characteristic:(NSString*)charcUuidStr
                  callback:(RCTResponseSenderBlock)callback) {
  BLE_LOG(@"BLECentral:read from %@: %@.%@", deviceUuidStr, serviceUuidStr, charcUuidStr);
  
  BLEPeriphCharc* pc = [self getPeriphCharc:deviceUuidStr service:serviceUuidStr characteristic:charcUuidStr];
  if (!pc) {
    callback(@[@{ @"error": @"Couldn't look up characteristic for peripheral",
                  @"uuid": deviceUuidStr,
                  @"characteristicUUID": charcUuidStr },
               [NSNull null]]);
    return;
  }
  NSString *key = [self keyForPeripheral: pc.peripheral andCharacteristic:pc.characteristic];
  [readCallbacks setObject:callback forKey:key];
  
  [pc.peripheral readValueForCharacteristic:pc.characteristic];  // callback sends value
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral advertisementData:(NSDictionary *)advertisementData RSSI:(NSNumber *)RSSI {
  BLE_LOG(@"BLECentral:didDiscoverPeripheral %@", [peripheral asDictionary]);

  [peripherals addObject:peripheral];
  [peripheral setAdvertisementData:advertisementData RSSI:RSSI];
  [self.bridge.eventDispatcher sendDeviceEventWithName:@"ble:peripheralDiscovered" body:[peripheral asDictionary]];
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
  BLE_LOG(@"BLECentral: CBCentralManager status changed to: %ld %@",
        central.state, [self centralManagerStateToString: central.state]);
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
  BLE_LOG(@"BLECentral:didConnectPeripheral");
  
  peripheral.delegate = self;
  // TODO: it's inefficient to discover all services
  [peripheral discoverServices:nil];
  // NB: not calling connect success until characteristics are discovered
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  BLE_LOG(@"BLECentral:didDisconnectPeripheral");

  RCTResponseSenderBlock callback = [connectCallbacks valueForKey:peripheral.uuidAsString];
  if (callback) {
    callback(@[@{ @"error": @"Peripheral disconnected", @"uuid": peripheral.uuidAsString }, [NSNull null]]);
    [connectCallbacks removeObjectForKey:peripheral.uuidAsString];
  }
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
  BLE_LOG(@"BLECentral:didFailToConnectPeripheral");

  RCTResponseSenderBlock callback = [connectCallbacks valueForKey:peripheral.uuidAsString];
  if (callback) {
    callback(@[@{ @"error": @"Peripheral disconnected", @"uuid": peripheral.uuidAsString }, [NSNull null]]);
    [connectCallbacks removeObjectForKey:peripheral.uuidAsString];
  }
}

#pragma mark CBPeripheralDelegate

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error {
  BLE_LOG(@"BLECentral:didDiscoverServices");
  
  // save the services to tell when all characteristics have been discovered
  NSMutableSet *servicesForPeriperal = [NSMutableSet new];
  [servicesForPeriperal addObjectsFromArray:peripheral.services];
  [connectCallbackLatches setObject:servicesForPeriperal forKey:[peripheral uuidAsString]];
  
  for (CBService *service in peripheral.services) {
    [peripheral discoverCharacteristics:nil forService:service]; // discover all is slow
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error {
  BLE_LOG(@"BLECentral:didDiscoverCharacteristicsForService %@", service);
#ifdef SUPER_VERBOSE
  for (CBCharacteristic *characteristic in service.characteristics) {
    BLE_LOG(@"    characteristic %@", characteristic);
  }
#endif//

  NSString *peripheralUUIDString = [peripheral uuidAsString];
  NSMutableSet *latch = [connectCallbackLatches valueForKey:peripheralUUIDString];
  if (!latch) {
    BLE_LOG(@"Warning: discovered characteristics for ignored device %@", peripheralUUIDString);
    return;
  }
  [latch removeObject:service];
  if ([latch count] == 0) {
    // Call success callback for connect
    RCTResponseSenderBlock callback = [connectCallbacks valueForKey:peripheral.uuidAsString];
    callback(@[[NSNull null], [peripheral asDictionary]]);
    [connectCallbacks removeObjectForKey:peripheralUUIDString];
    [connectCallbackLatches removeObjectForKey:peripheralUUIDString];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didUpdateValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
  //BLE_LOG(@"didUpdateValueForCharacteristic");
  
  NSString *key = [self keyForPeripheral: peripheral andCharacteristic:characteristic];
#if 0
  NSString *notifyCallbackId = [notificationCallbacks objectForKey:key];
  
  if (notifyCallbackId) {
    NSData *data = characteristic.value; // send RAW data to Javascript
    
    CDVPluginResult *pluginResult = nil;
    pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsArrayBuffer:data];
    [pluginResult setKeepCallbackAsBool:TRUE]; // keep for notification
    [self.commandDelegate sendPluginResult:pluginResult callbackId:notifyCallbackId];
  }
#endif
  
  RCTResponseSenderBlock readCallback = [readCallbacks objectForKey:key];
  if(readCallback) {
    NSData *data = characteristic.value; // send RAW data to Javascript
    readCallback(@[[NSNull null], [data base64EncodedString]]);
    [readCallbacks removeObjectForKey:key];
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

// RedBearLab
-(CBService *) findServiceFromUUID:(CBUUID *)UUID p:(CBPeripheral *)p
{
  for(int i = 0; i < p.services.count; i++)
  {
    CBService *s = [p.services objectAtIndex:i];
    if ([self compareCBUUID:s.UUID UUID2:UUID])
      return s;
  }
  
  return nil; //Service not found on this peripheral
}

// RedBearLab
-(CBCharacteristic *) findCharacteristicFromUUID:(CBUUID *)UUID service:(CBService*)service
{
  BLE_LOG(@"Looking for %@", UUID);
  for(int i=0; i < service.characteristics.count; i++)
  {
    CBCharacteristic *c = [service.characteristics objectAtIndex:i];
    BLE_LOG(@"Characteristic %@", c);
    if ([self compareCBUUID:c.UUID UUID2:UUID]) return c;
  }
  
  return nil; //Characteristic not found on this service
}

// RedBearLab
-(int) compareCBUUID:(CBUUID *) UUID1 UUID2:(CBUUID *)UUID2
{
  char b1[16];
  char b2[16];
  [UUID1.data getBytes:b1];
  [UUID2.data getBytes:b2];
  
  if (memcmp(b1, b2, UUID1.data.length) == 0)
    return 1;
  else
    return 0;
}

- (BLEPeriphCharc*)getPeriphCharc:(NSString*)deviceUuidStr service:(NSString*)serviceUuidStr characteristic:(NSString*)charcUuidStr {
  CBUUID *serviceUUID = [CBUUID UUIDWithString:serviceUuidStr];
  CBUUID *characteristicUUID = [CBUUID UUIDWithString:charcUuidStr];

  CBPeripheral *peripheral = [self findPeripheralByUUID:deviceUuidStr];
  if (!peripheral) {
    return nil;
  }
  CBService *service = [self findServiceFromUUID:serviceUUID p:peripheral];
  if (!service) {
    return nil;
  }
  CBCharacteristic *characteristic = [self findCharacteristicFromUUID:characteristicUUID service:service];
  if (!characteristic) {
    return nil;
  }
  BLEPeriphCharc* pc = [[BLEPeriphCharc alloc] init];
  pc.peripheral = peripheral;
  pc.characteristic = characteristic;
  return pc;
}

-(NSString *) keyForPeripheral: (CBPeripheral *)peripheral andCharacteristic:(CBCharacteristic *)characteristic {
  return [NSString stringWithFormat:@"%@|%@", [peripheral uuidAsString], [characteristic UUID]];
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
