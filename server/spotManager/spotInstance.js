var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var spawnSync = require('child_process').spawnSync;

var requestSpotInstance = function (inputData, callback) {
	console.log("Making Request For a Spot Instance...");

	var spotCommand, specification, requestId, requestState;

	specification = JSON.stringify(JSON.stringify(inputData.Specification));

	spotCommand = "aws ec2 request-spot-instances --spot-price " + inputData.SpotPrice + " --instance-count " + inputData.InstanceCount + " --type " + inputData.RequestType + " --launch-specification " + specification;

	console.log(spotCommand);
	exec(spotCommand, function (reqErr, stdout, stderr) {
		if(reqErr || stderr || !stdout) return callback(reqErr, null, null);
		var requestData = JSON.parse(stdout)['SpotInstanceRequests'][0];
		console.log("Spot Instance Request Data:\n", requestData);
		requestId = requestData.SpotInstanceRequestId;
		requestState = requestData.State;
		callback(null, requestId, requestState);
	});
}

var getInstanceId = function (requestId, requestState, callback) {
	console.log("Waiting for fulfillment of spot instance request.....");
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
				console.log("spot instance request fulfilled.....\nspot instance id:", instanceId);
				return callback(null, instanceId)
			}
		} else if(requestData.State == 'closed') {
			return callback(requestData.Status.Code, null);
		}
	}
	getInstanceid(requestId);
}

var getInstanceData = function (instanceId, callback) {
	console.log("Getting instance data of :", instanceId);
	var spotCommand, spotCommandArgs, instanceData, getInstanceData;
	spotCommand = 'aws';
	spotCommandArgs = ['ec2', 'describe-instances', '--instance-ids', instanceId];

	console.log(spotCommand, spotCommandArgs);
	getInstanceData = spawnSync(spotCommand, spotCommandArgs, { maxBuffer: 200*1024*1024,
		stdio: [
	    	0, // Doesn't use parent's stdin for child
	    	'pipe', // Direct child's stdout to an array output at index 1
	    	'pipe' // Direct child's stderr to an array output at index 2
	  	],
	  	encoding: 'UTF-8'
	});

	if(getInstanceData.output[2] || getInstanceData.error) {
		console.log("Error:", (getInstanceData.output[2] || getInstanceData.error));
		callback(getInstanceData.output[2] || getInstanceData.error, null);
	} else if(getInstanceData.status == 0 && getInstanceData.signal == null && getInstanceData.output[1]) {
		instanceData = JSON.parse(getInstanceData.output[1])['Reservations'][0]['Instances'][0];
		console.log("Spot Instance Data:\n", instanceData);
		callback(null, instanceData);
	}
}


var connectInstance = function (instanceData, keyName, result, resultPath, callback) {
	var sshCommand, sshCommandArgs, connectInstance, connectData;
	var output = 'tail /var/log/cloud-init-output.log';
	result['success'] = [];
	result['error'] = [];

	if(instanceData.State.Name == 'running') {
		sshCommand = 'ssh';
		sshCommandArgs = ['-i', __dirname+'/'+keyName+'.pem', '-oStrictHostKeyChecking=no', 'ubuntu@'+instanceData.PublicDnsName, output];

		console.log(sshCommand, sshCommandArgs);
		connectInstance = spawnSync(sshCommand, sshCommandArgs, { maxBuffer: 200*1024*1024,
			stdio: [
		    	0, // Doesn't use parent's stdin for child
		    	'pipe', // Direct child's stdout to an array output at index 1
		    	'pipe' // Direct child's stderr to an array output at index 2
		  	],
		  	encoding: 'UTF-8'
		});

		if(connectInstance.output[2] || connectInstance.error) {
			console.log("Error:", (connectInstance.output[2] || connectInstance.error));
			result.error.push("Instance output: Error:", (connectInstance.output[2] || connectInstance.error));
		} else if(connectInstance.status == 0 && connectInstance.signal == null && connectInstance.output[1]) {
			connectData = JSON.parse(connectInstance.output[1]);
			result.success.push("Instance output: Progress:", connectData);
			console.log("Instance output: Progress:", connectData);
			callback(result);
		}
	} else if(instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
		console.log("Instance Terminated");
		result.success.push("Did not run");
		result.error.push("Instance Terminated");
		callback(result);
	}
}

var getInstanceOutput = function (instanceData, keyName, result, resultPath, callback) {
	var sshCommand, sshCommandArgs, connectInstance, connectData;
	result['success'] = [];
	result['error'] = [];
	
	if(instanceData.State.Name == 'running') {
		sshCommand = 'ssh';
		sshCommandArgs = ['-i', __dirname+'/'+keyName+'.pem', '-oStrictHostKeyChecking=no', 'ubuntu@'+instanceData.PublicDnsName, '-p 4000'];

		console.log(sshCommand, sshCommandArgs);
		connectInstance = spawnSync(sshCommand, sshCommandArgs, { maxBuffer: 200*1024*1024,
			stdio: [
		    	0, // Doesn't use parent's stdin for child
		    	'pipe', // Direct child's stdout to an array output at index 1
		    	'pipe' // Direct child's stderr to an array output at index 2
		  	],
		  	encoding: 'UTF-8'
		});

		if(connectInstance.output[2] || connectInstance.error) {
			console.log("Error:", (connectInstance.output[2] || connectInstance.error));
			result.error.push("Instance output: Error:", (connectInstance.output[2] || connectInstance.error));
		} else if(connectInstance.status == 0 && connectInstance.signal == null && connectInstance.output[1]) {
			connectData = JSON.parse(connectInstance.output[1]);
			result.success.push("Instance output: Progress:", connectData);
			console.log("Instance output: Progress:", connectData);
			callback(result);
		}
	} else if(instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
		console.log("Instance Terminated");
		result.success.push("Did not run");
		result.error.push("Instance Terminated");
		callback(result);
	}
}

var terminateInstance = function (instanceId, callback) {
	console.log("Terminating instance....");
	var command = 'aws ec2 terminate-instances --instance-ids ' + instanceId;
	console.log(command);

	exec(command, function (termErr, stdout, stderr) {
		if(termErr || stderr || !stdout) return callback(termErr, null);
		var terminateData = JSON.parse(stdout)["TerminatingInstances"][0]["CurrentState"]["Name"];
		callback(null, terminateData);
	});
}

var cancelRequest = function (spotRequestId, callback) {
	console.log("Cancelling spot instance request....");
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
exports.connectInstance = connectInstance;
exports.getInstanceOutput = getInstanceOutput;
exports.terminateInstance = terminateInstance;
exports.cancelRequest = cancelRequest;