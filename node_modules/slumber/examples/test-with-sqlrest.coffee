#!/usr/bin/env coffee

# clear terminal
process.stdout.write '\u001B[2J\u001B[0;0f'


slumber = require '..'

api = slumber.API 'http://www.thomas-bayer.com/sqlrest/', {}, ->

  api('CUSTOMER').get (err, resp) ->
    console.log err, resp

  api('CUSTOMER')(3).get (err, resp) ->
    console.log err, resp
