/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "RCTAssert.h"
#import "RCTBridge.h"
#import "RCTBridgeDelegate.h"

#import "SLKAppSDKService.h"
#import "SLKAppSDKDelegate.h"
#import "SLKAppSDKEventEmitter.h"

@interface SLKAppSDKService () <RCTBridgeDelegate>

@end

@implementation SLKAppSDKService
{
  RCTBridge *_bridge;
  id<SLKAppSDKDelegate> _delegate;
  SLKAppSDKEventEmitter *_eventEmitter;
  BOOL _initialized;
}

RCT_NOT_IMPLEMENTED(- (instancetype)init)

- (instancetype)initWithDelegate:(id<SLKAppSDKDelegate>)delegate
{
  if ((self = [super init])) {
    _delegate = delegate;
    _eventEmitter = [[SLKAppSDKEventEmitter alloc] initWithDelegate:delegate];
    _bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:nil];
    _initialized = NO;

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(javaScriptDidLoad:)
                                                 name:RCTJavaScriptDidLoadNotification
                                               object:_bridge];

  }
  return self;
}

- (void)javaScriptDidLoad:(NSNotification *)notification
{
  RCTAssertMainQueue();
  _initialized = YES;
}

- (void)postMessage:(id)message
{
  if (!_initialized) {
    [_delegate onMessage:@{
      @"type": @"MESSAGE_ERROR",
      @"error": @"NOT_INITIALIZED",
      @"message": message,
    }];
    return;
  }
  [_eventEmitter sendEventWithName:@"silkAppSDKMessage" body:message];
}

// RCTBridgeDelegate

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [NSURL URLWithString:@"http://localhost:8081/app-sdk/src/sdk/index.bundle?platform=ios&dev=true"];
}

- (NSArray *)extraModulesForBridge:(RCTBridge *)bridge
{
  return @[_eventEmitter];
}

@end
