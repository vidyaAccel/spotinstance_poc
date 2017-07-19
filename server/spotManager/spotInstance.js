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
	var spotCommand, spotCommandArgs, instanceData, instance;
	spotCommand = 'aws';
	spotCommandArgs = ['ec2', 'describe-instances', '--instance-ids', instanceId];

	console.log(spotCommand + " " + spotCommandArgs.join(" "));
	instance = spawnSync(spotCommand, spotCommandArgs, { maxBuffer: 200*1024*1024,
		stdio: [
	    	0, // Doesn't use parent's stdin for child
	    	'pipe', // Direct child's stdout to an array output at index 1
	    	'pipe' // Direct child's stderr to an array output at index 2
	  	],
	  	encoding: 'UTF-8'
	});

	if(instance.output[2] || instance.error) {
		console.log("Error:", (instance.output[2] || instance.error));
		callback(instance.output[2] || instance.error, null);
	} else if(instance.status == 0 && instance.signal == null && instance.output[1]) {
		instanceData = JSON.parse(instance.output[1])['Reservations'][0]['Instances'][0];
		console.log("Spot Instance Data:\n", instanceData);
		if(instanceData.State.Name == 'pending' || instanceData.State.Name == 'shutting-down') getInstanceData(instanceData.InstanceId, callback);
		else callback(null, instanceData);
	}
}


var connectInstance = function (instanceData, keyName, result, callback) {
	console.log("Running Jobs in instance.\nPlease wait for Jobs to complete......");
	if(instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
		console.log("Instance Terminated");
		result.success.push("Did not run");
		result.error.push("Instance Terminated");
		return callback(result, instanceData);
	} else if(instance_terminated[instanceData.InstanceId]) {
		console.log("Instance Terminated");
		result.success.push("Did not run");
		result.error.push("Instance Terminated");
		return callback(result, instanceData);
	}
	setTimeout(function () {
		var sshCommand, sshCommandArgs, connect, connectData;
		var output = 'tail /var/log/cloud-init-output.log';

		if(instanceData.State.Name == 'running') {
			sshCommand = 'ssh';
			sshCommandArgs = ['-i', __dirname+'/'+keyName+'.pem', '-oStrictHostKeyChecking=no', 'ubuntu@'+instanceData.PublicDnsName, output];

			console.log(sshCommand + " " + sshCommandArgs.join(" "));
			connect = spawnSync(sshCommand, sshCommandArgs, { maxBuffer: 200*1024*1024,
				stdio: [
			    	0, // Doesn't use parent's stdin for child
			    	'pipe', // Direct child's stdout to an array output at index 1
			    	'pipe' // Direct child's stderr to an array output at index 2
			  	],
			  	encoding: 'UTF-8'
			});

			if(connect.error) {
				console.log("Error:", connect.error);
				result.error.push("Instance output: Error:", connect.error);
			} else if(connect.status == 0 && connect.signal == null && connect.output[1]) {
				connectData = connect.output[1];
				result.success.push("Instance output: Progress:", connectData);
				console.log("Instance output: Progress:", connectData);
			}
			if(connect.output[1] && connect.output[1].includes('finished')) callback(result, instanceData);
			else connectInstance(instanceData, keyName, result, callback);
		}
	}, 10000);
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
exports.terminateInstance = terminateInstance;
exports.cancelRequest = cancelRequest;