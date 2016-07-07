/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import <Foundation/Foundation.h>
#import "SLKAppSDKDelegate.h"

@interface SLKAppSDKService : NSObject

- (instancetype)initWithDelegate:(id<SLKAppSDKDelegate>)delegate NS_DESIGNATED_INITIALIZER;

- (void)postMessage:(NSDictionary<NSString *, id> *)message;

@end
