//
//  ClientViewController.h
//  SilkAppSDKExample
//
//  Created by Wayne Lee on 9/21/16.
//  Copyright © 2016 Silk Labs. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface ClientViewController : UIViewController

@property (nonatomic) NSString *clientId;
@property (weak, nonatomic) IBOutlet UILabel *statusText;
@property (weak, nonatomic) IBOutlet UITextView *clientDetailsText;
@end
