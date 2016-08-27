/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import <UIKit/UIKit.h>

@interface DeviceViewController : UIViewController <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic) NSString *deviceKey;
@property (weak, nonatomic) IBOutlet UILabel *statusText;
@property (weak, nonatomic) IBOutlet UIScrollView *deviceDetailsScrollView;
@property (weak, nonatomic) IBOutlet UITextView *deviceDetailsText;

@property (weak, nonatomic) IBOutlet UITextField *passwordText;

@property (weak, nonatomic) IBOutlet UITableView *wifiNetworkTableView;

@property (weak, nonatomic) IBOutlet UIButton *buttonA;
@property (weak, nonatomic) IBOutlet UIButton *buttonB;
@property (weak, nonatomic) IBOutlet UIButton *buttonC;
@property (weak, nonatomic) IBOutlet UIButton *buttonD;

@end
