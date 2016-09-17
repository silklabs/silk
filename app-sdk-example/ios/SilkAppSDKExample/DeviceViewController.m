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
  error = ![error isKindOfClass:[NSString class]] ? @"" : error;
  
  if ([error length] == 0) {
    return status;
  } else {
    return [NSString stringWithFormat:@"%@ (%@)", status, error];
  }
}

- (void) updateView {
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  
  NSString *status = [appState getStatus];
  NSString *deviceConfigStatus = deviceInfo[@"deviceConfigStatus"];
  
  NSMutableString *text = [[NSMutableString alloc] init];
  
  [text appendFormat:@"deviceType:\t%@", deviceInfo[@"deviceType"]];
  [text appendFormat:@"\ndeviceId:\t\t%@", deviceInfo[@"deviceId"]];
  [text appendFormat:@"\nacctDevNum:\t%@", deviceInfo[@"accountDeviceNumber"]];
  [text appendFormat:@"\nconfigId:\t\t%@", deviceInfo[@"deviceConfigId"]];
  [text appendFormat:@"\nconfigStatus:\t%@ - paired: %@", deviceInfo[@"deviceConfigStatus"], deviceInfo[@"paired"]];
  [text appendFormat:@"\nserver:\t\t%@", deviceInfo[@"serverConnectionStatus"]];
  [text appendFormat:@"\nbleConn:\t\t%@", [self formatStatus:deviceInfo[@"bleConnectionStatus"] andError:deviceInfo[@"bleConnectionError"]]];
  [text appendFormat:@"\nwifiConn:\t\t%@", [self formatStatus:deviceInfo[@"wifiStatus"] andError:deviceInfo[@"wifiError"]]];
  [text appendFormat:@"\nserverConn:\t%@", [self formatStatus:deviceInfo[@"serverStatus"] andError:deviceInfo[@"serverError"]]];
  [text appendFormat:@"\nrtcConn:\t\t%@", [self formatStatus:deviceInfo[@"rtcConnectionStatus"] andError:deviceInfo[@"rtcConnectionError"]]];
  [text appendFormat:@"\nwifi:\t\t\t%@ (%@)", deviceInfo[@"wifiSSID"], deviceInfo[@"wifiLevel"]];
  [text appendFormat:@"\nupdate:\t\t%@ - %@ sec remaining (%@)", deviceInfo[@"updateState"], deviceInfo[@"updateDownloadRemainingSec"], deviceInfo[@"updateError"]];
  
  // Buttons/actions change depending on device configuration state
  NSString *buttonAText = @"Accept";
  NSString *buttonBText = @"Decline";
  NSString *buttonCText = @"Config";
  NSString *buttonDText = @"Abort";
  NSString *buttonEText = @"";

  BOOL buttonAEnabled = YES;
  BOOL buttonBEnabled = YES;
  BOOL buttonCEnabled = YES;
  BOOL buttonDEnabled = YES;
  BOOL buttonEEnabled = YES;

  SEL selectorA = @selector(onAcceptPress:);
  SEL selectorB = @selector(onDeclinePress:);
  SEL selectorC = @selector(onConfigPress:);
  SEL selectorD = @selector(onAbortPress:);
  SEL selectorE = @selector(onNullPress:);
  
  if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
    buttonAText = @"BLE Conn";
    buttonBText = @"Wifi";
    buttonCText = @"Info";
    buttonDText = @"Config";
    buttonEText = @"Remove";

    buttonBEnabled = [deviceInfo[@"bleConnectionStatus"] isEqualToString:@"CONNECTED"];
    buttonCEnabled = [deviceInfo[@"bleConnectionStatus"] isEqualToString:@"CONNECTED"];
    buttonDEnabled = [deviceInfo[@"bleConnectionStatus"] isEqualToString:@"CONNECTED"];

    selectorA = @selector(onBLEConnectPress:);
    selectorB = @selector(onGetWifiListPress:);
    selectorC = @selector(onGetWifiInfoPress:);
    selectorD = @selector(onSetWifiPress:);
    selectorE = @selector(onRemovePress:);

    // Toggle BLE Connect/Disconnect based on if ble has been requested
    NSNumber *bleRequested = deviceInfo[@"bleRequested"];
    if ([bleRequested isEqual: @YES]) {
      buttonAText = @"Disconn";
      selectorA = @selector(onBLEDisconnectPress:);
    }
  }
  
  // Dispatch to main thread for snappy UI updates
  dispatch_async(dispatch_get_main_queue(), ^{
    
    [self.buttonA setTitle:buttonAText forState:UIControlStateNormal];
    [self.buttonB setTitle:buttonBText forState:UIControlStateNormal];
    [self.buttonC setTitle:buttonCText forState:UIControlStateNormal];
    [self.buttonD setTitle:buttonDText forState:UIControlStateNormal];
    [self.buttonE setTitle:buttonEText forState:UIControlStateNormal];

    [self.buttonA setEnabled:buttonAEnabled];
    [self.buttonB setEnabled:buttonBEnabled];
    [self.buttonC setEnabled:buttonCEnabled];
    [self.buttonD setEnabled:buttonDEnabled];
    [self.buttonE setEnabled:buttonEEnabled];

    // Remove all targets and update.
    [self.buttonA removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonB removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonC removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonD removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonE removeTarget:nil action:NULL forControlEvents:UIControlEventTouchUpInside];
    [self.buttonA addTarget:self action:selectorA forControlEvents:UIControlEventTouchUpInside];
    [self.buttonB addTarget:self action:selectorB forControlEvents:UIControlEventTouchUpInside];
    [self.buttonC addTarget:self action:selectorC forControlEvents:UIControlEventTouchUpInside];
    [self.buttonD addTarget:self action:selectorD forControlEvents:UIControlEventTouchUpInside];
    [self.buttonE addTarget:self action:selectorE forControlEvents:UIControlEventTouchUpInside];
    
    if ([buttonEText isEqualToString: @""]) {
      self.buttonE.hidden = true;
    } else {
      self.buttonE.hidden = false;
    }

    self.statusText.text = status;
    self.deviceDetailsText.text = text;

    // All of this is to make it scroll horizontally, it's hacky :(
    float width = ceil([text sizeWithAttributes:@{NSFontAttributeName: self.deviceDetailsText.font}].width) + 20;
    self.deviceDetailsText.frame = CGRectMake(self.deviceDetailsText.frame.origin.x, self.deviceDetailsText.frame.origin.y, width, self.deviceDetailsText.frame.size.height);
    self.deviceDetailsScrollView.contentSize = CGSizeMake( width, self.deviceDetailsScrollView.frame.size.height);

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
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceInfo[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceConfigId);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId}];
  
  [appState updateStatus:@"Sent ACCEPT"];
}

- (IBAction)onConfigPress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_SET_CONFIG";
  NSString *deviceName = @"DummyName";
  NSString *wifiSSID = selectedWifiSSID;
  NSString *wifiPassword = self.passwordText.text;
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceInfo[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@ %@ %@ %@", msgType, deviceConfigId, deviceName, wifiSSID, wifiPassword);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId,
                             @"deviceName": deviceName, @"wifiSSID": wifiSSID, @"wifiPassword": wifiPassword}];

  [appState updateStatus:@"Sent SET_CONFIG"];
}

- (IBAction)onDeclinePress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_DECLINE";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceInfo[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceConfigId);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId}];

  [appState updateStatus:@"Sent DECLINE"];
}

- (IBAction)onAbortPress:(id)sender {
  NSString *msgType = @"DEVICE_CONFIG_ABORT";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSNumber *deviceConfigId = deviceInfo[@"deviceConfigId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceConfigId);
  [silkService postMessage:@{@"type": msgType, @"deviceConfigId": deviceConfigId}];

  [appState updateStatus:@"Sent ABORT"];
}

/**
 * Button handlers for when device is configured
 */

- (IBAction)onBLEConnectPress:(id)sender {
  NSString *msgType = @"DEVICE_BLE_CONNECT";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  
  // Wifi list was not valid since there was no ble connection
  [self clearWifiList];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  [appState updateBleRequested:@YES forDeviceKey:self.deviceKey];

  [appState updateStatus:@"Sent BLE_CONNECT"];
}

- (IBAction)onBLEDisconnectPress:(id)sender {
  NSString *msgType = @"DEVICE_BLE_DISCONNECT";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  
  // Disconnecting, so wifi list is invalid
  [self clearWifiList];

  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  [appState updateBleRequested:@NO forDeviceKey:self.deviceKey];
  
  [appState updateStatus:@"Sent BLE_DISCONNECT"];
}

- (IBAction)onGetWifiListPress:(id)sender {
  NSString *msgType = @"DEVICE_WIFI_LIST";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];

  // Clear current Wifi list in UI before asking for a new one
  [self clearWifiList];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  
  [appState updateStatus:@"Sent WIFI_LIST"];
}

- (IBAction)onSetWifiPress:(id)sender {
  
  NSString *msgType = @"DEVICE_WIFI_SET";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  NSString *accessPoint = selectedWifiSSID;
  NSString *password = self.passwordText.text;
  
  NSLog(@"DeviceViewController: send %@ %@ %@ %@", msgType, deviceId, accessPoint, password);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId,
                             @"accessPoint": accessPoint, @"password": password}];
  
  
  [appState updateStatus:@"Sent WIFI_SET"];
}

- (IBAction)onGetWifiInfoPress:(id)sender {
  
  NSString *msgType = @"DEVICE_WIFI_GETINFO";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  
  [appState updateStatus:@"Sent WIFI_GETINFO"];
}

- (IBAction)onNullPress:(id)sender {
}

- (IBAction)onRemovePress:(id)sender {
  
  NSString *msgType = @"DEVICE_REMOVE";
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceId = deviceInfo[@"deviceId"];
  
  NSLog(@"DeviceViewController: send %@ %@", msgType, deviceId);
  [silkService postMessage:@{@"type": msgType, @"deviceId": deviceId}];
  
  [appState updateStatus:@"Sent DEVICE_REMOVE"];
}

/**
 * Wifi network table related functions
 */

-(NSString*) getWifiKey {
  // Wifi network info uses different keys depending on if the device is configured.
  NSDictionary *deviceInfo = [appState getDeviceInfoFromDeviceKey:self.deviceKey];
  NSString *deviceConfigStatus = deviceInfo[@"deviceConfigStatus"];
  NSString *wifiKey;
  
  if ([deviceConfigStatus isEqualToString: @"CONFIGURED"]) {
    wifiKey = deviceInfo[@"deviceId"];
  } else {
    wifiKey = [deviceInfo[@"deviceConfigId"] stringValue];
  }
  return wifiKey;
}

-(NSArray*) getWifiNetworks {
  return [appState getWifiNetworksFromDeviceKey:[self getWifiKey]];
}

-(void) clearWifiList {
  NSArray* emptyWifiNetworks = [[NSArray alloc] init];
  [appState updateWifiNetworks:emptyWifiNetworks forDeviceKey:[self getWifiKey]];
}

-(NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
  return [[self getWifiNetworks] count];
}

-(UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
  NSString *SimpleIdentifier = @"SimpleIdentifier";
  UITableViewCell* cell = [tableView dequeueReusableCellWithIdentifier:SimpleIdentifier];
  
  if (cell == nil) {
    cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleValue1 reuseIdentifier:SimpleIdentifier];
  }
  
  NSString *ssid = @"";
  NSNumber *rssi = 0;
  NSDictionary *wifiNetwork = [[self getWifiNetworks] objectAtIndex: indexPath.row];
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