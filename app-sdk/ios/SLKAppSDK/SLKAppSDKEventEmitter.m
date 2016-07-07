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
  return @[@"silkAppSDKMessage"];
}

RCT_EXPORT_METHOD(postMessage:(NSDictionary<NSString *, id> *)message)
{
  [_delegate onMessage:message];
}

@end
