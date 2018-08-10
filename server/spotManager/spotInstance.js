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
		
		console.log(''+spotCommand);
		exec(spotCommand, function (reqErr, stdout, stderr) {
			if(reqErr || stderr || !stdout) return callback(reqErr, null);
			requestData = JSON.parse(stdout)['SpotInstanceRequests'][0];
			requestState = requestData.State;
		});
		if(requestState == 'open') {
			setTimeout(function () {
				getInstanceid(requestData.SpotInstanceRequestId);
			}, 10*1000);
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
	console.log("Getting instance state of :", instanceId);
	var spotCommand, spotCommandArgs, instanceData, instance;
	spotCommand = 'aws';
	spotCommandArgs = ['ec2', 'describe-instances', '--instance-ids', instanceId];

	console.log(spotCommand + " " + spotCommandArgs.join(" ") );
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
	} else if(instance.status == 0 && instance.signal == null) {
		instanceData = JSON.parse(instance.output[1])['Reservations'][0]['Instances'][0];
		console.log("Spot Instance State:\n", instanceData.State.Name);
		if(instanceData.State.Name == 'pending' || instanceData.State.Name == 'shutting-down') getInstanceData(instanceData.InstanceId, callback);
		else callback(null, instanceData);
	}
}


var connectInstance = function (instanceData, keyName, result, callback) {
	if(instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated' || instance_terminated[instanceData.InstanceId] == true) {
		console.log("Instance Terminated, couldn't connect to get result.");
		result.success.push("\nInstance Terminated\n");
		result.error.push("\nInstance Terminated\n");
		return callback(result, instanceData);
	}
	setTimeout(function () {
		var sshCommand, sshCommandArgs, connect, connectData;
		var output = 'cat /home/ubuntu/user-data.log';

		if(instanceData.State.Name == 'running') {
			sshCommand = 'ssh';
			sshCommandArgs = ['-i', __dirname+'/'+keyName+'.pem', '-oStrictHostKeyChecking=no', 'ubuntu@'+instanceData.PublicDnsName, output];

			connect = spawnSync(sshCommand, sshCommandArgs, { maxBuffer: 200*1024*1024,
				stdio: [
			    	0, // Doesn't use parent's stdin for child
			    	'pipe', // Direct child's stdout to an array output at index 1
			    	'pipe' // Direct child's stderr to an array output at index 2
			  	],
			  	timeout: 10000,
			  	killSignal: 'SIGKILL',
			  	encoding: 'UTF-8'
			});

			if(connect.error || connect.output[2]) {
				if(connect.signal == 'SIGKILL') result.error.push((JSON.stringify(JSON.stringify(connect.error)) || JSON.stringify(connect.output[2])));
				else if(!result.error.includes(connect.error || connect.output[2])) {
					result.error.push((connect.error || connect.output[2]));
				}
			}
			if(connect.output[1]) {
				connectData = connect.output[1];
				result.success = [connectData];
				console.log('Logs of job running in spot Instance:\n'+connectData);
			}

			if(connect.status == 0 && connect.signal == null) {
				if(connect.output[1].includes('Completed All Jobs')) {
					result.success = [connect.output[1]];
					console.log('Logs of job running in spot Instance:\n'+result.success+'\nError of running jobs in spot instance:\n'+result.error);
					return callback(result, instanceData);
				} else if(connect.output[0] != null && connect.output[0].includes('Connection refused')) {
					console.log('Logs of job running in spot Instance:\n'+result.success+'\nError of running jobs in spot instance:\n'+result.error);
					return callback(result, instanceData);
				} else connectInstance(instanceData, keyName, result, callback);
			} else {
				if(connect.signal == 'SIGKILL') {
					console.log("Instance Terminated, couldn't connect to get result.");
					result.success.push("\nInstance Terminated\n");
					result.error.push("\nInstance Terminated\n");
					return callback(result, instanceData);
				} else connectInstance(instanceData, keyName, result, callback);
			}
		} else connectInstance(instanceData, keyName, result, callback);
	}, 2000);
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
	var command = 'aws ec2 cancel-spot-instance-requests --spot-instance-request-ids ' + spotRequestId;
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