package com.silklabs.appsdk.example;

public class Device {
  public String deviceType;
  public String deviceId;
  public String deviceConfigId;
  public String deviceConfigStatus;
  public String wifiConnectionStatus;
  public String wifiConnectionError;
  public String serverConnectionStatus;
  public String serverConnectionError;
  public String bleConnectionStatus;
  public String bleConnectionError;
  public String rtcConnectionStatus;
  public String rtcConnectionError;

  @Override
  public String toString() {
    return (this.deviceConfigStatus == "UNCONFIGURED") ? ("* " + this.deviceConfigId) : this.deviceId;
  }
}
