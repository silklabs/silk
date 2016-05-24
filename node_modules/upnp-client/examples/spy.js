var upnp = require('../')
  , inspect = require('util').inspect
  , log = function(event) {
    return function(device) {
      console.log('UPNP Event: \033[33m%s\033[39m', event)
      console.log(inspect(device, true, 10, true))
      console.log()
    }
  }

cp = new upnp.ControlPoint()
cp.on('DeviceAvailable', log('DeviceAvailable'))
cp.on('DeviceUpdated', log('DeviceUpdated'))
cp.on('DeviceUnavailable', log('DeviceUnavailable'))
cp.on('DeviceFound', log('DeviceFound'))
cp.search()
