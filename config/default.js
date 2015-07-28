/**
Base configuration for the project.

Every other configuration profile inherits from this (and can override it).
*/

export default {
  server: {
    port: process.env.PORT || 5000
  },

  // Purely here for testing....
  testing: {
    value: false,
    description: 'Purely for testing'
  }
};
