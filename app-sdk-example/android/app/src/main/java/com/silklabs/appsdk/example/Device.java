package com.silklabs.appsdk.example;

import java.lang.StringBuilder;

public class Device {
  public String deviceType;
  public String deviceId;
  public Integer accountDeviceNumber;
  public Integer deviceConfigId;
  public String deviceConfigStatus;
  public String wifiConnectionStatus;
  public String wifiSSID;
  public Integer wifiSignalStrength;
  public String wifiConnectionError;
  public String serverConnectionStatus;
  public String serverConnectionError;
  public String bleConnectionStatus;
  public String bleConnectionError;
  public String rtcConnectionStatus;
  public String rtcConnectionError;
  public String updateState;
  public boolean paired = false;
  public boolean isPairing = false;
  public boolean waitingForResponse = false;

  @Override
  public String toString() {
    String label = this.deviceConfigStatus.equals("UNCONFIGURED") ?
      "Unconfigured Device " + this.deviceConfigId :
      this.deviceId;
    return label;
  }

  public String status() {
    StringBuilder builder = new StringBuilder();
    builder.append("deviceType: ").append(deviceType).append("\n");
    builder.append("deviceId: ").append(deviceId).append("\n");
    builder.append("accountDeviceNumber: ").append(accountDeviceNumber).append("\n");
    builder.append("deviceConfigId: ").append(deviceConfigId).append("\n");
    builder.append("deviceConfigStatus: ").append(deviceConfigStatus).append(" - paired: ").append(paired).append("\n");
    builder.append("wifiConnectionStatus: ").append(wifiConnectionStatus).append("\n");
    builder.append("wifiSSID: ").append(wifiSSID).append("\n");
    builder.append("wifiSignalStrength: ").append(wifiSignalStrength).append("\n");
    builder.append("wifiConnectionError: ").append(wifiConnectionError).append("\n");
    builder.append("serverConnectionStatus: ").append(serverConnectionStatus).append("\n");
    builder.append("serverConnectionError: ").append(serverConnectionError).append("\n");
    builder.append("bleConnectionStatus: ").append(bleConnectionStatus).append("\n");
    builder.append("bleConnectionError: ").append(bleConnectionError).append("\n");
    builder.append("rtcConnectionStatus: ").append(rtcConnectionStatus).append("\n");
    builder.append("rtcConnectionError: ").append(rtcConnectionError).append("\n");
    builder.append("updateState: ").append(updateState).append("\n");

    return builder.toString();
  }
}
