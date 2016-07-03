/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "RCTEventEmitter.h"
#import "SLKAppSDKDelegate.h"

@interface SLKAppSDKEventEmitter : RCTEventEmitter

- (instancetype)initWithDelegate:(id<SLKAppSDKDelegate>)delegate NS_DESIGNATED_INITIALIZER;

@end
