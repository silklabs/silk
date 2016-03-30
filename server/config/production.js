/**
Production configuration profile.
*/
export default {

  socketio: {
    // Where to bind as passed by heroku:
    port: process.env.PORT
  },

  signaling: {
    // TODO: Turn this on when we go to N servers.
    useServiceDiscovery: false,
    // Where to bind as passed by heroku:
    port: process.env.PORT
  },

  server: {
    // Where to bind as passed by heroku:
    port: process.env.PORT
  },

  testing: {
    value: false
  }

};
