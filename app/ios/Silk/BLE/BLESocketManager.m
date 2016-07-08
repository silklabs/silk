#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(BLESocketManager,
                                   BLESocketManager,
                                   NSObject)
  RCT_EXTERN_METHOD(start)
  RCT_EXTERN_METHOD(stop)

  RCT_EXTERN_METHOD(addBeaconUuid:(NSString *)beaconUuid)
  RCT_EXTERN_METHOD(removeBeaconUuid:(NSString *)beaconUuid)
  RCT_EXTERN_METHOD(removeAllBeaconUuids)

  RCT_EXTERN_METHOD(send:(NSInteger)id dataBase64:(NSString *)dataBase64)
  RCT_EXTERN_METHOD(enableRssiUpdates:(NSInteger)id enable:(BOOL)enable)
  RCT_EXTERN_METHOD(finish:(NSInteger)id)
  RCT_EXTERN_METHOD(disconnect:(NSInteger)id)

  RCT_EXTERN_METHOD(acceptConfigConnections:(BOOL)accept)
@end
