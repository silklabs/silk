/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "ViewController.h"
#import "DeviceViewController.h"
#import "ClientViewController.h"
#import "AppDelegate.h"
#import "AppState.h"

@interface ViewController () {
  AppState* appState;
  SLKAppSDKService *silkService;
  NSString *selectedKey; // key of selected device from device table
}
@end

@implementation ViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  
  self.title = @"Silk Example SDK App";

  appState = [AppState getInstance];
  silkService = appState.silkService;
  
  self.emailTextField.text = @"user@example.com";
  self.passwordTextField.text = @"password";

  // Register to receive notifications to update this view
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(refreshView:) name:@"refreshView" object:nil];
  [self updateView];
}

- (void)refreshView:(NSNotification*) notifiction {
  [self updateView];
}

- (NSString*) formatStatus: (NSString*) status andError: (NSString*) error {
  status = ![status isKindOfClass:[NSString class]] ? @"<NULL>" : status;
  error = ![error isKindOfClass:[NSString class]] ? @"" : error;
  
  if ([error length] == 0) {
    return status;
  } else {
    return [NSString stringWithFormat:@"%@ (%@)", status, error];
  }
}

- (void) updateView {
  NSString *status = [appState getStatus];
  NSString *connectionStatus = [appState getConnectionStatus];
  NSString *connectionError = [appState getConnectionError];
  NSString *authStatus = [appState getAuthStatus];
  NSString *authError = [appState getAuthError];
  
  connectionStatus = [self formatStatus:connectionStatus andError:connectionError];
  authStatus = [self formatStatus:authStatus andError:authError];
  
  // Dispatch to main thread for snappy UI updates
  dispatch_async(dispatch_get_main_queue(), ^{
    self.statusText.text = status;
    self.connectionStatusText.text = connectionStatus;
    self.authStatusText.text = authStatus;
    
    [self.deviceTableView reloadData];
  });
}

- (IBAction)onLoginButtonPress:(id)sender {
  NSString *msgType = @"ACCOUNT_LOGIN_PASSWORD";
  NSString *email = self.emailTextField.text;
  NSString *password = self.passwordTextField.text;

  NSLog(@"ViewController: send %@ %@ %@", msgType, email, password);
  [silkService postMessage:@{@"type": msgType, @"email": email, @"password": password}];
  
  [appState updateStatus:@"Sent ACCOUNT_LOGIN_PASSWORD"];
}

- (IBAction)onLogoutButtonPress:(id)sender {
  NSString *msgType = @"ACCOUNT_LOGOUT";

  NSLog(@"ViewController: send %@", msgType);
  [silkService postMessage:@{@"type": msgType}];

  [appState updateStatus:@"Sent ACCOUNT_LOGOUT"];
}

// Device table
-(NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
  NSArray *devicesList = [appState getDevicesClientsArray];
  
  return [devicesList count];
}

- (IBAction)onRefreshDevicesPressed:(id)sender {
  NSString *msgType = @"DEVICE_LIST_UPDATE";
  
  NSLog(@"ViewController: send %@", msgType);
  [silkService postMessage:@{@"type": msgType}];
  
  [appState updateStatus:@"Sent DEVICE_LIST_UPDATE"];
}

- (IBAction)onRefreshClientsPressed:(id)sender {
  NSString *msgType = @"CLIENT_LIST_UPDATE";
  
  NSLog(@"ViewController: send %@", msgType);
  [silkService postMessage:@{@"type": msgType}];
  
  [appState updateStatus:@"Sent CLIENT_LIST_UPDATE"];
}

-(UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
  NSString *SimpleIdentifier = @"SimpleIdentifier";
  UITableViewCell* cell = [tableView dequeueReusableCellWithIdentifier:SimpleIdentifier];
  
  if (cell == nil) {
    cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:SimpleIdentifier];
  }

  NSArray *devicesList = [appState getDevicesClientsArray];
  NSString *key = [devicesList objectAtIndex: indexPath.row];
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:key];
  NSDictionary *client = [appState getClientFromClientId:key];
  NSString *deviceConfigStatus = deviceInfo[@"deviceConfigStatus"];
  
  if (deviceInfo) {
    // This row is a device
    if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
      cell.textLabel.text = [NSString stringWithFormat:@"%@ (%@)", @"Name", deviceInfo[@"deviceId"]];
    } else {
      cell.textLabel.text = [NSString stringWithFormat:@"Unconfigured device %@",  deviceInfo[@"deviceConfigId"]];
    }
  } else {
    // This row is a client
    cell.textLabel.text = [NSString stringWithFormat:@"%@ (%@)", client[@"name"], client[@"clientId"]];
  }
  return cell;
}

- (void)prepareForSegue:(UIStoryboardSegue *)segue sender:(id)sender {
  // Before switching to the device details view, tell it which device was selected.
  if ([segue.destinationViewController isKindOfClass:[DeviceViewController class]]) {
    [(DeviceViewController *)segue.destinationViewController setDeviceKey:selectedKey];
    selectedKey = nil;
  } else if ([segue.destinationViewController isKindOfClass:[ClientViewController class]]) {
    [(ClientViewController *)segue.destinationViewController setClientId:selectedKey];
    selectedKey = nil;
  }

}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(nonnull NSIndexPath *)indexPath {
  NSArray *devicesList = [appState getDevicesClientsArray];
  selectedKey = [devicesList objectAtIndex: indexPath.row];
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:selectedKey];

  NSString *viewControllerName;
  if (deviceInfo) {
    viewControllerName = @"DeviceViewController";
  } else {
    viewControllerName = @"ClientViewController";
  }

  // Deselect entry and go to details view
  [tableView deselectRowAtIndexPath:indexPath animated:false];
  [self performSegueWithIdentifier:viewControllerName sender:self];
}

// Needed to dismiss keyboard when Done is pressed
-(BOOL)textFieldShouldReturn:(UITextField *)textField
{
  [textField resignFirstResponder];
  return YES;
}

@end
