# Silk Web App [![Build Status](https://magnum.travis-ci.com/silklabs/silk-webapp.svg?token=j54FanpWeLbC7r1NyfJA)](https://magnum.travis-ci.com/silklabs/silk-webapp)
Silk app written for the web.

## Setting up a development environment

```
npm install
```

then run the following to start the server:
```
npm start
```

If working with a local server, add `config.local.js` to the root of
`silk-webapp` to override the serverUrl then run `npm install` again:
```js
config = {
  server: {
    url: 'http://localhost:5000'
  }
}
```

* The static content in `public/` maybe edited in place with the server running.
* If you are editing the js in `src/www`, run `bin/postinstall -w` in a separate
  console to watch and automatically deploy changes into `public/js`.

## S3 Deployment

Upon merging a change Travis CI will deploy the application (`public/`) to the silk-webapp
bucket in S3.

* http://silk-webapp.s3-website-us-east-1.amazonaws.com/master/latest/
* http://silk-webapp.s3-website-us-east-1.amazonaws.com/next/latest/
* http://silk-webapp.s3-website-us-east-1.amazonaws.com/release/latest/
