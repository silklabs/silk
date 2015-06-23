#!/system/bin/busybox sh

if [ $(busybox id -u) -ne 0 ]; then
  echo '(suing)'
  exec su -c $0
fi

set -e

bt_status=$(getprop bluetooth.status)
if [ "$bt_status" = "on" ]; then
  echo Bluetooth enabled
else
  echo "Load the firmware (TODO: start bluetoothd too?)"
  start hciattach

  while true; do
    bt_status=$(getprop bluetooth.status)
    if [ "$bt_status" = "on" ]; then
      break;
    fi
    echo "Waiting for bluetooth.status=on (currently $bt_status)"
    sleep 1s
  done
fi

echo Bring the hci interface up
hciconfig hci0 up
hciconfig

echo Emit LE iBeacon
# Credit: http://www.wadewegner.com/2014/05/create-an-ibeacon-transmitter-with-the-raspberry-pi/


#
# NB. For all LE Controller Commands, the OGF code is defined as 0x08
#

# 7.8.5 LE Set Advertising Parameters Command (OCF 0x0006)
#
# A0 00 - Advertising_Interval_Min - N * 0.625ms = 100ms
# A0 00 - Advertising_Interval_Max - N * 0.625ms = 100ms
# 03 - Advertising_Type - Non connectable undirected advertising (ADV_NONCONN_IND)
# 00 - Own_Address_Type - Public Device Address (default)
# 00 - Direct_Address_Type - Public Device Address (default)
# 00 00 00 00 00 00 - Direct_Address - Public Device Address or Random Device Address of the device to be connected
# 07 -  Advertising_Channel_Map - Default (all channels enabled)
# 00 - Advertising_Filter_Policy - Allow Scan Request from Any, Allow Connect Request from Any
#
hcitool -i hci0 cmd 0x08 0x0006 A0 00 A0 00 03 00 00 00 00 00 00 00 00 07 00


# 7.8.9 LE Set Advertise Enable Command (OCF 0x000a)
#
# 01 - Advertising_Enable - Advertising is enabled
#
hcitool -i hci0 cmd 0x08 0x000a 01

# 7.8.7 LE Set Advertising Data Command (OCF 0x0008)
#
# 1E - Advertising_Data_Length - 30 octets

# 02 - AD field length
# 01 - AD type - Flags
#   01 - LE General Discoverable Mode flag set

# 1A - AD field length
# FF - AD type - Manufacturer Specific Data (2 or more octets)
#   4C 00 - Company Identifier Code - Apple
#   02  - Type - iBeacon
#   15  - iBeacon data length
#     E3 C5 6D B5 DF FB 48 D2 B0 60 D0 F5 A7 10 96 E0 - iBeacon UUID
#     00 00 - Major version
#     00 00 - Minor version
#     C8 - Tx power (as returned from "7.8.6 LE Read Advertising Channel Tx Power Command"???)
hcitool -i hci0 cmd 0x08 0x0008 1E 02 01 1A 1A FF 4C 00 02 15 E3 C5 6D B5 DF FB 48 D2 B0 60 D0 F5 A7 10 96 E0 00 00 00 00 C8 00

