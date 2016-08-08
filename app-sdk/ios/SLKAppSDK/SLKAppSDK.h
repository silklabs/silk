/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import <UIKit/UIKit.h>

//! Project version number for SLKAppSDK.
FOUNDATION_EXPORT double SLKAppSDKVersionNumber;

//! Project version string for SLKAppSDK.
FOUNDATION_EXPORT const unsigned char SLKAppSDKVersionString[];

#import <SLKAppSDK/SLKAppSDKService.h>
#import <SLKAppSDK/SLKAppSDKDelegate.h>


// ObjC -> Swift bridging headers aren't possible in Frameworks, so this is a
// work-around. If you add any files here, make sure you also add them to the
// public section in the Headers build phase.
#import "RCTBridge.h"
#import "RCTEventDispatcher.h"
