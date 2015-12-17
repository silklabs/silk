require('babel/register')({
  // Ignore everything in node_modules except node_modules/rcomponents.
  ignore: /node_modules\/(?!silk-server)/,
  stage: 0,
  only: require('babelfilter')
});
