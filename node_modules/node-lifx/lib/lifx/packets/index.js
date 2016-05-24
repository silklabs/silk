var packets = exports;

/*
 * Device related packages
 */
packets.getService = require('./getService');
packets.stateService = require('./stateService');

packets.getHostInfo = require('./getHostInfo');
packets.stateHostInfo = require('./stateHostInfo');

packets.getHostFirmware = require('./getHostFirmware');
packets.stateHostFirmware = require('./stateHostFirmware');

packets.getWifiInfo = require('./getWifiInfo');
packets.stateWifiInfo = require('./stateWifiInfo');

packets.getWifiFirmware = require('./getWifiFirmware');
packets.stateWifiFirmware = require('./stateWifiFirmware');

packets.getLabel = require('./getLabel');
packets.setLabel = require('./setLabel');
packets.stateLabel = require('./stateLabel');

packets.getPower = require('./getPower');
packets.setPower = require('./setPower');
packets.statePower = require('./statePower');

packets.getVersion = require('./getVersion');
packets.stateVersion = require('./stateVersion');

packets.acknowledgement = require('./acknowledgement');

packets.echoRequest = require('./echoRequest');
packets.echoResponse = require('./echoResponse');

packets.getLocation = require('./getLocation');
packets.stateLocation = require('./stateLocation');

packets.getOwner = require('./getOwner');
packets.stateOwner = require('./stateOwner');

packets.getGroup = require('./getGroup');
packets.stateGroup = require('./stateGroup');

/*
 * Light device related packages
 */
packets.getLight = require('./getLight');
packets.stateLight = require('./stateLight');

packets.setColor = require('./setColor');
packets.setWaveform = require('./setWaveform');

packets.getTemperature = require('./getTemperature');
packets.stateTemperature = require('./stateTemperature');

/*
 * Sensor related packages
 */
packets.getAmbientLight = require('./getAmbientLight');
packets.stateAmbientLight = require('./stateAmbientLight');
