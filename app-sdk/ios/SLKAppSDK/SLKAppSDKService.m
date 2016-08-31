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
#import "SLKConfig.h"
#import <SLKAppSDK/SLKAppSDK-Swift.h>

@interface SLKAppSDKService () <RCTBridgeDelegate, RegionMonitorDelegate>

@end

@implementation SLKAppSDKService
{
  RCTBridge *_bridge;
  id<SLKAppSDKDelegate> _delegate;
  SLKAppSDKEventEmitter *_eventEmitter;
  SLKConfig *_config;
  RegionMonitor *_regionMonitor;
  BLESocketPeripheral *_socketPeripheral;
  BOOL _initialized;
}

RCT_NOT_IMPLEMENTED(- (instancetype)init)

- (instancetype)initWithDelegate:(id<SLKAppSDKDelegate>)delegate
{
  if ((self = [super init])) {
    _delegate = delegate;
    _eventEmitter = [[SLKAppSDKEventEmitter alloc] initWithDelegate:delegate];
    _config = [SLKConfig new];
    _regionMonitor = [[RegionMonitor alloc] initWithDelegate:self];
    _bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:nil];
    _socketPeripheral = [[BLESocketPeripheral alloc] initWithRegionMonitor:_regionMonitor];
    _initialized = NO;

    [_regionMonitor start];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(javaScriptDidLoad:)
                                                 name:RCTJavaScriptDidLoadNotification
                                               object:_bridge];

  }
  return self;
}

- (void)applicationDidBecomeActive {
  [_socketPeripheral setForeground];
}

- (void)applicationDidEnterBackground {
  [_socketPeripheral setBackground];
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
  return _config.jsBundleURL;
}

- (NSArray *)extraModulesForBridge:(RCTBridge *)bridge
{
  return @[_eventEmitter, _config, [BLESocketManager new]];
}

// RegionMonitorDelegate

- (void)regionAdded:(RegionMonitor *)regionMonitor uuid:(NSUUID *)uuid {
  [_socketPeripheral regionAdded:uuid];
}

- (void)regionRemoved:(RegionMonitor *)regionMonitor uuid:(NSUUID *)uuid {
  [_socketPeripheral regionRemoved:uuid];
}

- (void)regionEntered:(RegionMonitor *)regionMonitor uuid:(NSUUID *)uuid {
  [_socketPeripheral regionEntered:uuid];
}

- (void)regionExited:(RegionMonitor *)regionMonitor uuid:(NSUUID *)uuid {
  [_socketPeripheral regionExited:uuid];
}

- (void)regionBeacons:(RegionMonitor *)regionMonitor uuid:(NSUUID *)uuid deviceNumbers:(NSSet<NSNumber *> *)deviceNumbers {
  [_socketPeripheral regionBeacons:uuid deviceNumbers:deviceNumbers];
}

@end
