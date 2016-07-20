#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(BLESocketManager,
                                   BLESocketManager,
                                   NSObject)
  RCT_EXTERN_METHOD(start)
  RCT_EXTERN_METHOD(stop)

  RCT_EXTERN_METHOD(addBeaconUuid:(NSString *)beaconUuid)
  RCT_EXTERN_METHOD(removeBeaconUuid:(NSString *)beaconUuid)
  RCT_EXTERN_METHOD(removeAllBeaconUuids)

  RCT_EXTERN_METHOD(send:(NSInteger)connectionId
              dataBase64:(NSString *)dataBase64)
  RCT_EXTERN_METHOD(enableRssiUpdates:(NSInteger)connectionId
                               enable:(BOOL)enable)
  RCT_EXTERN_METHOD(finish:(NSInteger)connectionId)
  RCT_EXTERN_METHOD(disconnect:(NSInteger)connectionId)

  RCT_EXTERN_METHOD(scanForUnconfiguredDevices:(BOOL)shouldScan)
@end
