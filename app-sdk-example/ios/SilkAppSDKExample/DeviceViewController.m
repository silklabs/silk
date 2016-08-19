/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

#import "DeviceViewController.h"
#import "DeviceCommViewController.h"
#import "AppState.h"

@implementation DeviceViewController {
  AppState* appState;
  SLKAppSDKService *silkService;
  NSString* selectedWifiSSID; // currently selected SSID in Wi-Fi table
}

- (void)viewDidLoad {
  [super viewDidLoad];
  
  self.title = [NSString stringWithFormat: @"Device Details %@", self.deviceKey];
  
  appState = [AppState getInstance];
  silkService = appState.silkService;
  selectedWifiSSID = @"";
  
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
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  
  NSString *status = [appState getStatus];
  NSString *deviceType = deviceStatus[@"deviceType"];
  NSString *deviceId = deviceStatus[@"deviceId"];
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  NSString *deviceConfigStatus = deviceStatus[@"deviceConfigStatus"];
  
  NSNumber *bleConnectionRequested = deviceStatus[@"bleConnectionRequested"];
  NSNumber *accountDeviceNumber = deviceStatus[@"accountDeviceNumber"];
  
  NSString *wifiConnectionStatus = deviceStatus[@"wifiConnectionStatus"];
  NSString *wifiConnectionError = deviceStatus[@"wifiConnectionError"];
  NSString *serverConnectionStatus = deviceStatus[@"serverConnectionStatus"];
  NSString *serverConnectionError = deviceStatus[@"serverConnectionError"];
  NSString *bleConnectionStatus = deviceStatus[@"bleConnectionStatus"];
  NSString *bleConnectionError = deviceStatus[@"bleConnectionError"];
  NSString *rtcConnectionStatus = deviceStatus[@"rtcConnectionStatus"];
  NSString *rtcConnectionError = deviceStatus[@"rtcConnectionError"];

  deviceId = ![deviceId isKindOfClass:[NSString class]] ? @"<NULL>" : deviceId;
  NSString *deviceConfigIdString = ![deviceConfigId isKindOfClass:[NSNumber class]] ? @"<NULL>" : [deviceConfigId stringValue];
  
  NSString* bleConnectionRequestedString = ![bleConnectionRequested isKindOfClass:[NSNumber class]] ? @"<NULL>" : [NSString stringWithFormat:@"%@", [bleConnectionRequested intValue] != 0 ? @"true" : @"false"];
  NSString* accountDeviceNumberString = ![accountDeviceNumber isKindOfClass:[NSNumber class]] ? @"<NULL>" : [accountDeviceNumber stringValue];
  
  wifiConnectionStatus = [self formatStatus:wifiConnectionStatus andError:wifiConnectionError];
  serverConnectionStatus = [self formatStatus:serverConnectionStatus andError:serverConnectionError];
  bleConnectionStatus = [self formatStatus:bleConnectionStatus andError:bleConnectionError];
  rtcConnectionStatus = [self formatStatus:rtcConnectionStatus andError:rtcConnectionError];
  
  // Buttons/actions change depending on device configuration state
  NSString *buttonAText = @"Accept";
  NSString *buttonBText = @"Config";
  NSString *buttonCText = @"Decline";
  NSString *buttonDText = @"Abort";
  
  SEL selectorA = @selector(onAcceptPress:);
  SEL selectorB = @selector(onConfigPress:);
  SEL selectorC = @selector(onDeclinePress:);
  SEL selectorD = @selector(onAbortPress:);
  
  if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
    buttonAText = @"Connect";
    buttonBText = @"Get Wifi";
    buttonCText = @"Config";
    buttonDText = @"Disconnect";
    
    selectorA = @selector(onBLEConnectPress:);
    selectorB = @selector(onGetWifiPress:);
    selectorC = @selector(onSetWifiPress:);
    selectorD = @selector(onBLEDisconnectPress:);
  }
  
  // Dispatch to main thread for snappy UI updates
  dispatch_async(dispatch_get_main_queue(), ^{
    
    [self.buttonA setTitle:buttonAText forState:UIControlStateNormal];
    [self.buttonB setTitle:buttonBText forState:UIControlStateNormal];
    [self.buttonC setTitle:buttonCText forState:UIControlStateNormal];
    [self.buttonD setTitle:buttonDText forState:UIControlStateNormal];
    
    // Remove all targets and update.
    [self.buttonA removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonB removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonC removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonD removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonA addTarget:self action:selectorA forControlEvents:UIControlEventTouchUpInside];
    [self.buttonB addTarget:self action:selectorB forControlEvents:UIControlEventTouchUpInside];
    [self.buttonC addTarget:self action:selectorC forControlEvents:UIControlEventTouchUpInside];
    [self.buttonD addTarget:self action:selectorD forControlEvents:UIControlEventTouchUpInside];

    self.statusText.text = status;
    self.deviceTypeText.text = deviceType;
    self.deviceIdText.text = deviceId;
    self.deviceConfigIdText.text = deviceConfigIdString;
    self.deviceConfigStatusText.text = deviceConfigStatus;
    
    self.bleConnectionRequestedText.text = bleConnectionRequestedString;
    self.accountDeviceNumberText.text = accountDeviceNumberString;
    
    self.wifiConnectionStatusText.text = wifiConnectionStatus;
    self.serverConnectionStatusText.text = serverConnectionStatus;
    self.bleConnectionStatusText.text = bleConnectionStatus;
    self.rtcConnectionStatusText.text = rtcConnectionStatus;

    [self.wifiNetworkTableView reloadData];
  });
}

/**
 * Button handlers
 */
- (void)prepareForSegue:(UIStoryboardSegue *)segue sender:(id)sender {
  // Before switching to the device comms view, tell it which device was selected.
  if ([segue.destinationViewController isKindOfClass:[DeviceCommViewController class]]) {
    [(DeviceCommViewController *)segue.destinationViewController setDeviceKey:self.deviceKey];
  }
}

- (IBAction)onCommPress:(id)sender {
  [self performSegueWithIdentifier:@"DeviceCommViewController" sender:self];
}

/**
 * Button handlers for when device is not configured
 */
- (IBAction)onAcceptPress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_ACCEPT";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceConfigId);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId}];
  
  [appState updateStatus:@"Sent ACCEPT"];
}

- (IBAction)onConfigPress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_SET_CONFIG";
  NSString *deviceName = @"DummyName";
  NSString *wifiSSID = selectedWifiSSID;
  NSString *wifiPassword = self.passwordText.text;
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@ %@ %@ %@", msgType, deviceConfigId, deviceName, wifiSSID, wifiPassword);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId,
                             @"deviceName": deviceName, @"wifiSSID": wifiSSID, @"wifiPassword": wifiPassword}];

  [appState updateStatus:@"Sent SET_CONFIG"];
}

- (IBAction)onDeclinePress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_DECLINE";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceConfigId);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId}];

  [appState updateStatus:@"Sent DECLINE"];
}

- (IBAction)onAbortPress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_ABORT";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceStatus[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceConfigId);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId}];

  [appState updateStatus:@"Sent ABORT"];
}

/**
 * Button handlers for when device is configured
 */

- (IBAction)onBLEConnectPress:(id)sender {
  NSString *msgType = @"DEVICE_BLE_CONNECT";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceStatus[@"deviceId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];

  [appState updateStatus:@"Sent BLE_CONNECT"];
}

- (IBAction)onGetWifiPress:(id)sender {
  NSString *msgType = @"DEVICE_WIFI_LIST";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceStatus[@"deviceId"];

  // Clear current Wifi list in UI before asking for a new one
  NSArray* emptyWifiNetworks = [[NSArray alloc] init];
  [appState updateWifiNetworks:emptyWifiNetworks forDeviceKey:deviceId];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  
  [appState updateStatus:@"Sent WIFI_LIST"];
}

- (IBAction)onSetWifiPress:(id)sender {
  
  NSString *msgType = @"DEVICE_WIFI_SET";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceStatus[@"deviceId"];
  NSString *accessPoint = selectedWifiSSID;
  NSString *password = self.passwordText.text;
  
  NSLog(@"DeviceViewController: send %@ %@ %@ %@", msgType, deviceId, accessPoint, password);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId,
                             @"accessPoint": accessPoint, @"password": password}];
  
  
  [appState updateStatus:@"Sent WIFI_SET"];
}

- (IBAction)onBLEDisconnectPress:(id)sender {
  NSString *msgType = @"DEVICE_BLE_DISCONNECT";
  NSDictionary *deviceStatus = [appState getDeviceStatusFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceStatus[@"deviceId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  
  [appState updateStatus:@"Sent BLE_DISCONNECT"];
}

/**
 * Wifi network table related functions
 */

-(NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
  NSArray *wifiNetworks = [appState getWifiNetworksFromDeviceKey:self.deviceKey];
  return [wifiNetworks count];
}

-(UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
  NSArray *wifiNetworks = [appState getWifiNetworksFromDeviceKey:self.deviceKey];
  
  NSString *SimpleIdentifier = @"SimpleIdentifier";
  UITableViewCell* cell = [tableView dequeueReusableCellWithIdentifier:SimpleIdentifier];
  
  if (cell == nil) {
    cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleValue1 reuseIdentifier:SimpleIdentifier];
  }
  
  NSString *ssid = @"";
  NSNumber *rssi = 0;
  NSDictionary *wifiNetwork = [wifiNetworks objectAtIndex: indexPath.row];
  if (wifiNetwork != nil) {
    ssid = wifiNetwork[@"ssid"];
    rssi = wifiNetwork[@"level"];
  }
  
  // Wi-Fi table may have changed, reselect currently selected network.
  if ([ssid isEqualToString:selectedWifiSSID]) {
    [self.wifiNetworkTableView selectRowAtIndexPath:indexPath animated:NO scrollPosition:
     UITableViewScrollPositionNone];
  }
  
  cell.textLabel.text = ssid;
  cell.detailTextLabel.text = [rssi stringValue];
  return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(nonnull NSIndexPath *)indexPath {

  UITableViewCell *selectedCell = [self.wifiNetworkTableView cellForRowAtIndexPath:indexPath];
  selectedWifiSSID = selectedCell.textLabel.text;
}

// Needed to dismiss keyboard when Done is pressed
-(BOOL)textFieldShouldReturn:(UITextField *)textField
{
  [textField resignFirstResponder];
  return YES;
}

@end