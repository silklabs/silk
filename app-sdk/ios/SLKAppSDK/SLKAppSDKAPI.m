/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "RCTBridge.h"
#import "RCTBridgeDelegate.h"

#import "SLKAppSDKAPI.h"
#import "SLKAppSDKDelegate.h"
#import "SLKAppSDKEventEmitter.h"

@interface SLKAppSDKAPI () <RCTBridgeDelegate>

@end

@implementation SLKAppSDKAPI
{
  RCTBridge *_bridge;
  id<SLKAppSDKDelegate> _delegate;
  SLKAppSDKEventEmitter *_eventEmitter;
}

RCT_NOT_IMPLEMENTED(- (instancetype)init)

- (instancetype)initWithDelegate:(id<SLKAppSDKDelegate>)delegate
{
  if ((self = [super init])) {
    _delegate = delegate;
    _eventEmitter = [[SLKAppSDKEventEmitter alloc] initWithDelegate:delegate];
    _bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:nil];
  }
  return self;
}

- (void)postMessage:(id)message
{
  [_eventEmitter sendEventWithName:@"message" body:message];
}

// RCTBridgeDelegate

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [NSURL URLWithString:@"http://localhost:8081/src/index.bundle?platform=ios&dev=true"];
}

- (NSArray *)extraModulesForBridge:(RCTBridge *)bridge
{
  return @[_eventEmitter];
}

@end
