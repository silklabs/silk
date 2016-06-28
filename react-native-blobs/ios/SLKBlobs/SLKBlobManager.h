/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 */
 
#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTURLRequestHandler.h"

@interface SLKBlobManager : NSObject <RCTBridgeModule, RCTURLRequestHandler>

- (NSString *)store:(NSData *)data;

- (NSData *)resolve:(NSDictionary<NSString *, id> *)blob;

- (NSData *)resolve:(NSString *)blobId offset:(NSInteger)offset size:(NSInteger)size;

- (void)release:(NSString *)blobId;

@end


@interface RCTBridge (SLKBlobManager)

@property (nonatomic, readonly) SLKBlobManager *blobs;

@end
