#import "RCTBridgeModule.h"

@interface RCT_EXTERN_REMAP_MODULE(BLESocketManager,
                                   BLESocketManager,
                                   NSObject)
  RCT_EXTERN_METHOD(send:(NSInteger)id dataBase64:(NSString *)dataBase64)
@end
