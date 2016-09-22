//
//  ClientViewController.m
//  SilkAppSDKExample
//
//  Created by Wayne Lee on 9/21/16.
//  Copyright © 2016 Silk Labs. All rights reserved.
//

#import "ClientViewController.h"
#import "AppState.h"


@implementation ClientViewController {
  AppState* appState;
  SLKAppSDKService *silkService;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  
  appState = [AppState getInstance];
  silkService = appState.silkService;
  
  self.title = [NSString stringWithFormat: @"Client Details %@", self.clientId];
  
  // Add edit button to nav bar
  UIBarButtonItem *editButton = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemEdit target:self action:@selector(onEditPressed:)];
  self.navigationItem.rightBarButtonItem = editButton;

  // Register to receive notifications to update this view
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(refreshView:) name:@"refreshView" object:nil];
  [self updateView];
}

- (void)refreshView:(NSNotification*) notification {
  [self updateView];
}

- (void) updateView {
  NSDictionary *client = [appState getClientFromClientId:self.clientId];

  NSString *status = [appState getStatus];
  NSMutableString *text = [[NSMutableString alloc] init];
  
  [text appendFormat:@"clientId:\t\t%@", client[@"clientId"]];
  [text appendFormat:@"\nname:\t\t%@", client[@"name"]];
  [text appendFormat:@"\nthisClient:\t\t%@", client[@"thisClient"]];
  
  // Dispatch to main thread for snappy UI updates
  dispatch_async(dispatch_get_main_queue(), ^{
    self.statusText.text = status;
    self.clientDetailsText.text = text;
  });
}

- (IBAction)onEditPressed:(id)sender {
  NSLog(@"Edit pressed");
  
  UIAlertController* alert = [UIAlertController
                              alertControllerWithTitle:@"Enter client name"
                              message:@""
                              preferredStyle:UIAlertControllerStyleAlert];
  
  [alert addTextFieldWithConfigurationHandler:^(UITextField *textField) {
    textField.placeholder = @"New client name";
  }];
  
  UIAlertAction* cancel = [UIAlertAction
                           actionWithTitle:@"Cancel" style:UIAlertActionStyleDefault
                           handler:^(UIAlertAction * action) { NSLog(@"Cancel pressed");}];
  
  UIAlertAction* defaultAction = [UIAlertAction
                                  actionWithTitle:@"OK" style:UIAlertActionStyleDefault
                                  handler:^(UIAlertAction * action) {
                                    NSString* name = alert.textFields[0].text;
                                    
                                    NSString *msgType = @"CLIENT_USERAGENT_SET";
                                    NSLog(@"ClientViewController: send %@ %@ %@", msgType, self.clientId, name);
                                    [silkService postMessage:@{@"type": msgType, @"clientId": self.clientId, @"userAgent": name}];
                                    [appState updateStatus:@"Sent CLIENT_USERAGENT_SET"];
                                  }];
  
  [alert addAction:cancel];
  [alert addAction:defaultAction];
  [self presentViewController:alert animated:YES completion:nil];
}

- (IBAction)onRemoveClientPressed:(id)sender {
  NSString *msgType = @"CLIENT_REMOVE";
  
  NSLog(@"ClientViewController: send %@ %@", msgType, self.clientId);
  [silkService postMessage:@{@"type": msgType, @"clientId": self.clientId}];
  
  [appState updateStatus:@"Sent CLIENT_REMOVE"];
}

@end
