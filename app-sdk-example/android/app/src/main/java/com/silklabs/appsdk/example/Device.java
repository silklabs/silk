package com.silklabs.appsdk.example;
import java.lang.StringBuilder;

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

  public String status() {
    StringBuilder builder = new StringBuilder();
    builder.append("deviceType: ").append(deviceType).append("\n");
    builder.append("deviceId: ").append(deviceId).append("\n");
    builder.append("deviceConfigId: ").append(deviceConfigId).append("\n");
    builder.append("deviceConfigStatus: ").append(deviceConfigStatus).append("\n");
    builder.append("wifiConnectionStatus: ").append(wifiConnectionStatus).append("\n");
    builder.append("wifiConnectionError: ").append(wifiConnectionError).append("\n");
    builder.append("serverConnectionStatus: ").append(serverConnectionStatus).append("\n");
    builder.append("serverConnectionError: ").append(serverConnectionError).append("\n");
    builder.append("bleConnectionStatus: ").append(bleConnectionStatus).append("\n");
    builder.append("bleConnectionError: ").append(bleConnectionError).append("\n");
    builder.append("rtcConnectionStatus: ").append(rtcConnectionStatus).append("\n");
    builder.append("rtcConnectionError: ").append(rtcConnectionError).append("\n");

    return builder.toString();
  }

}
