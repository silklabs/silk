require('babel/register')({
  // Ignore everything in node_modules except node_modules/rcomponents.
  stage: 0,
  only: require('silk-babeldeps')
});
