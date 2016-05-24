'use strict';
var tlds = require('tlds');

module.exports = function (domain) {
	if (!domain) {
		return false;
	}

	var tld = domain.split('.').pop();

	return tld && tlds.indexOf(tld) !== -1;
};
