var fs = require('fs');

var getCredential = function(callback) {
	fs.readFile(process.env.HOME+'/.aws/credentials', 'utf-8', function (error, data) {
		if(error || !data) {
			console.log("Please install and configure awscli... Then start the job.", error);
			return callback(error, null, null);
		}
		var newData = data.split('\n');
		var accessKey = newData[1].split('= ')[1];
		var secretKey = newData[2].split('= ')[1];
		var config = {accessKeyId: accessKey, secretAccessKey: secretKey, region:'us-west-2', apiVersion: '2016-11-15'}
		callback(null, accessKey, secretKey, config);
	});
}

var getResult = function(path, callback) {
	fs.readFile(path, 'utf-8', function (error, data) {
		if(error || !data) {
			console.log("No result found.....:", error);
			return callback(error);
		}
		var result = JSON.parse(data);
		callback(null, result);
	});
}

module.exports.getResult = getResult;
module.exports.getCredential = getCredential;