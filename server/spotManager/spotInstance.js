var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

var requestSpotInstance = function (inputData, callback) {
	var spotCommand, specification, requestId, requestState;

	specification = JSON.stringify(JSON.stringify(inputData.Specification));

	spotCommand = "aws ec2 request-spot-instances --spot-price " + inputData.SpotPrice + " --instance-count " + inputData.InstanceCount + " --type " + inputData.RequestType + " --launch-specification " + specification;

	console.log(spotCommand);
	exec(spotCommand, function (reqErr, stdout, stderr) {
		if(reqErr || stderr || !stdout) return callback(reqErr, null, null);
		var requestData = JSON.parse(data.toString())['SpotInstanceRequests'][0];
		console.log("Spot Instance Request Data:\n", requestData);
		requestId = requestData.SpotInstanceRequestId;
		requestState = requestData.State;
		callback(null, requestId, requestState);
	});
}

var getInstanceId = function (requestId, requestState, callback) {
	var requestState = requestState;
	var requestData;
	var getInstanceid = function (id) {
		var spotCommand = 'aws ec2 describe-spot-instance-requests --spot-instance-request-ids ' + id;
		
		console.log(spotCommand);
		exec(spotCommand, function (reqErr, stdout, stderr) {
			if(reqErr || stderr || !stdout) return callback(reqErr, null);
			requestData = JSON.parse(stdout)['SpotInstanceRequests'][0];
			requestState = requestData.State;
		});
		if(requestState == 'open') {
			setTimeout(function () {
				getInstanceid(requestData.SpotInstanceRequestId);
			}, 5*1000);
		} else if(requestState == 'active') {
			if(requestData.Status.Code == 'fulfilled') {
				var instanceId = requestData.InstanceId;
				return callback(null, instanceId)
			}
		} else if(requestData.State == 'closed') {
			return callback(requestData.Status.Code, null);
		}
	}
}

var getInstanceData = function (instanceId, callback) {
	var spotCommand, spotCommandArgs, instanceData, getInstanceData;
	spotCommand = 'aws';
	spotCommandArgs = ['ec2', 'describe-instances', '--instance-ids', instanceId];

	console.log(spotCommand, spotCommandArgs);
	getInstanceData = spawn(spotCommand, spotCommandArgs);

	getInstanceData.stdout.on('data', function (data) {
		instanceData = JSON.parse(data.toString())['Reservations'][0]['Instances'][0];
		console.log("Spot Instance Data:\n", instanceData);
	});

	getInstanceData.stderr.on('data', function (data) {
		callback(data.toString(), null);
	});

	getInstanceData.on('error', function (error) {
		callback(error, null);
	});

	getInstanceData.on('close', function (code, signal) {
		callback(null, instanceData);
	});
}

var terminateInstance = function (instanceId, callback) {
	var command = 'aws ec2 terminate-instances --instance-ids ' + instanceId;
	console.log(command);

	exec(command, function (termErr, stdout, stderr) {
		if(termErr || stderr || !stdout) return callback(termErr, null);
		var terminateData = JSON.parse(stdout)["TerminatingInstances"][0]["CurrentState"]["Name"];
		callback(null, terminateData);
	});
}

var cancelRequest = function (spotRequestId, callback) {
	var command = 'aws cancel-spot-instance-requests --spot-instance-request-ids ' + spotRequestId;
	console.log(command);
	
	exec(command, function (cancelErr, stdout, stderr) {
		if(cancelErr || stderr || !stdout) return callback(true, null);
		var cancelData = JSON.parse(stdout)["CancelledSpotInstanceRequests"][0]["State"];
		if(cancelData == 'cancelled') callback(null, true);
		else callback(true, false);
	});
}

exports.requestSpotInstance = requestSpotInstance;
exports.getInstanceId = getInstanceId;
exports.getInstanceData = getInstanceData;
exports.terminateInstance = terminateInstance;
exports.cancelRequest = cancelRequest;