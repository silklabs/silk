//
//  VBDisplayLayer.h
//  VBPlayer
//
//  Created by Ivan Ermolaev on 1/13/16.
//  Copyright © 2016 Viblast. All rights reserved.
//

#import <QuartzCore/QuartzCore.h>


/*
 VBDisplayLayer
 
 Return VBDisplayLayer class as layerClass of your UIView in order to
 display the output of VBPlayer instances via -setDisplayLayer method.

  @implementation MyPlayerView
  ...
  + (Class)layerClass {
    return [VBDisplayLayer class];
  }
  ...
  @end
 */
@interface VBDisplayLayer : CALayer

// You can use KVO to observe the following two properties
@property (nonatomic, readonly, getter=isReadyForDisplay) BOOL readyForDisplay;
@property (nonatomic, readonly) CGRect displayRect;
@end
