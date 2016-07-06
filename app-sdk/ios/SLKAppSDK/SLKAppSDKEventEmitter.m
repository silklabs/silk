/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "SLKAppSDKEventEmitter.h"

@implementation SLKAppSDKEventEmitter
{
  id<SLKAppSDKDelegate> _delegate;
}

RCT_EXPORT_MODULE()

- (instancetype)initWithDelegate:(id<SLKAppSDKDelegate>)delegate
{
  if ((self = [super init])) {
    _delegate = delegate;
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"message"];
}

RCT_EXPORT_METHOD(postMessage:(id)message)
{
  [_delegate onMessage:message];
}

@end
