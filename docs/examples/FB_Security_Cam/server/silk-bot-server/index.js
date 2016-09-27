'use strict'

var express = require('express'),
  fs = require('fs'),
  http = require('http'),
  https = require('https'),
  util = require('util'),
  routes = require('routes'),
  bodyParser = require('body-parser'),
  path = require('path'),
  multer = require('multer'),
  request = require('request'),
  app = express();


var server = https.createServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
  },
  app
)

server.listen(8080)
app.listen(4040)


var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'))
  },
  filename: function(req, file, cb) {
    cb(null, 'camimage.jpg')
  }
});

var upload = multer({
  storage: storage
}).single('campicture');


// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
  extended: false
}))

// parse application/json
app.use(bodyParser.json())

// index
app.get('/', function(req, res) {
  res.send('Hey there! I am a bot.')
})


app.post('/getimage/:id/:secret/', function(req, res, next) {
  var userid = req.params.id || 0;
  var secret = req.params.secret || 0;
  if ((userid === '') && (secret === '')) {
    upload(req, res, function(err) {
      if (err) {
        return console.error('Error:', err);
      }
    })
  } else {
    return console.log('Error.');
  }
})

app.get('/image/:id/:secret', function(req, res) {
  // res.sendFile(filepath);
  var userid = req.params.id || 0;
  var secret = req.params.secret || 0;
  if ((userid === '123451') && (secret === '0000a')) {
    res.sendFile(path.join(__dirname, 'uploads', 'camimage.jpg'));
  } else {
    return console.log('Error.');
  }

});


// for facebook verification
app.get('/webhook/', function(req, res) {
  if (req.query['hub.verify_token'] === '') {
    res.send(req.query['hub.challenge'])
  }
  res.send('Error, wrong token')
})

// to post data
app.post('/webhook/', function(req, res) {
  let messaging_events = req.body.entry[0].messaging
  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i]
    let sender = event.sender.id
    if (event.message && event.message.text) {
      let text = event.message.text
      if (text === 'Generic') {
        sendGenericMessage(sender)
        continue
      }
      sendTextMessage(sender, "Sending an image...")
      let imageLink =
      sendImage(sender, '')
    }
    if (event.postback) {
      let text = JSON.stringify(event.postback)
      sendTextMessage(sender, "Postback received: " + text.substring(0, 200), token)
      continue
    }
  }
  res.sendStatus(200)
})


// recommended to inject access tokens as environmental variables, e.g.
// const token = process.env.PAGE_ACCESS_TOKEN
const token = ""

function sendTextMessage(sender, text) {
  let messageData = {
    text: text
  }

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {
      access_token: token
    },
    method: 'POST',
    json: {
      recipient: {
        id: sender
      },
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }
  })
}


function sendImage(sender, image_url) {
  let messageData = {
    "attachment": {
      "type": "image",
      "payload": {
        "url": image_url
      }
    }
  }

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {
      access_token: token
    },
    method: 'POST',
    json: {
      recipient: {
        id: sender
      },
      message: messageData
    },


  }, function optionalCallback(err, httpResponse, body) {
    if (err) {
      return console.error('upload failed:', err);
    }
    console.log('Upload successful!  Server responded with:', body);
  });

}


function sendGenericMessage(sender) {
  let messageData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": "First card",
          "subtitle": "Element #1 of an hscroll",
          "image_url": "http://messengerdemo.parseapp.com/img/rift.png",
          "buttons": [{
            "type": "web_url",
            "url": "https://www.messenger.com",
            "title": "web url"
          }, {
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for first element in a generic bubble",
          }],
        }, {
          "title": "Second card",
          "subtitle": "Element #2 of an hscroll",
          "image_url": "http://messengerdemo.parseapp.com/img/gearvr.png",
          "buttons": [{
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for second element in a generic bubble",
          }],
        }]
      }
    }
  }
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {
      access_token: token
    },
    method: 'POST',
    json: {
      recipient: {
        id: sender
      },
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }
  })
}
