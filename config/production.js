/**
Production configuration profile.
*/
export default {

  socketio: {
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
