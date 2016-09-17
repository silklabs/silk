//
//  DeviceCommViewController.h
//  SilkAppSDKExample
//
//  Created by Wayne Lee on 8/18/16.
//  Copyright © 2016 Silk Labs. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface DeviceCommViewController : UIViewController

@property (nonatomic) NSString *deviceKey;
@property (weak, nonatomic) IBOutlet UILabel *statusText;
@property (weak, nonatomic) IBOutlet UITextView *logTextView;
@property (weak, nonatomic) IBOutlet UIView *previewView;
@property (weak, nonatomic) IBOutlet UIButton *togglePreviewButton;

@end
