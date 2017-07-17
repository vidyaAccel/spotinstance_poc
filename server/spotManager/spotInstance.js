var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

var requestSpotInstance = function (inputData, callback) {
	console.log("InputData:\n", inputData);

	var spotCommand, spotCommandArgs, specification, requestId, requestState;

	specification = JSON.stringify(JSON.stringify(inputData.Specification));

	spotCommand = 'aws';
	spotCommandArgs = ['ec2', 'request-spot-instances', '--spot-price', inputData.SpotPrice, '--instance-count', inputData.InstanceCount, '--type', inputData.RequestType, '--launch-specification', specification];

	console.log(spotCommand, spotCommandArgs);
	var spotRequest = spawn(spotCommand, spotCommandArgs);

	spotRequest.stdout.on('data', function (data) {
		var requestData = JSON.parse(data.toString())['SpotInstanceRequests'][0];
		console.log("Spot Instance Request Data:\n", requestData);
		requestId = requestData.SpotInstanceRequestId;
		requestState = requestData.State;
	});

	spotRequest.stderr.on('data', function (data) {
		callback(data.toString(), null, null);
	});

	spotRequest.on('error', function (error) {
		callback(error, null, null);
	});

	spotRequest.on('close', function (code, signal) {
		callback(null, requestId, requestState);
	});
}

var getInstanceId = function (requestId, requestState, callback) {
	var spotCommand, spotCommandArgs, spotRequestStatus, instanceId;
	if(requestState == 'open') {
		var getInstanceid = function (requestId, requestState, instance_callback) {
			spotCommand = 'aws';
			spotCommandArgs = ['ec2', 'describe-spot-instance-requests', '--spot-instance-request-ids', requestId];
			
			console.log(spotCommand, spotCommandArgs);
			spotRequestStatus = spawn(spotCommand, spotCommandArgs);

			spotRequestStatus.stdout.on('data', function (data) {
				var requestData = JSON.parse(data.toString())['SpotInstanceRequests'][0];
				console.log("Spot Instance Request Data:\n", requestData);
				if(requestData.State == 'active') {
					if(requestData.Status.Code == 'fulfilled') {
						instanceId = requestData.InstanceId;
					} else {
						instance_callback(requestData.Status.Code, null);
					}
				} else if(requestData.State == 'open') {
					setTimeout(function () {
						getInstanceid(requestId, requestState, callback);
					}, 5*1000);
				} else {
					instance_callback(requestData.Status.Code, null);
				}
			});

			spotRequestStatus.stderr.on('data', function (data) {
				instance_callback(data.toString(), null);
			});

			spotRequestStatus.on('error', function (error) {
				instance_callback(error, null);
			});

			spotRequestStatus.on('close', function (code, signal) {
				instance_callback(null, instanceId);
			});
		}
		getInstanceid(requestId, requestState, callback);
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

var connectInstance = function (instanceData, keyName, callback) {
	var sshCommand, sshCommandArgs, connectInstance, connectData;
	if(instanceData.State.Name == 'running') {
		sshCommand = 'ssh';
		sshCommandArgs = ['-i', __dirname+'/spotManager/'+keyName+'.pem', '-oStrictHostKeyChecking=no', 'ubuntu@'+instanceData.PublicDnsName];

		console.log(sshCommand, sshCommandArgs);
		connectInstance = spawn(sshCommand, sshCommandArgs);

		connectInstance.stdout.on('data', function (data) {
			connectData = JSON.parse(data.toString());
		});

		connectInstance.stderr.on('data', function (data) {
			callback(data.toString(), null);
		});

		connectInstance.on('error', function (error) {
			callback(error, null);
		});

		connectInstance.on('close', function (code, signal) {
			callback(null, connectData);
		});

	} else if(instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
		callback("Instance Terminated", null);
	}
}

var terminateInstance = function (instanceId, spotRquestType, callback) {
	var command = 'aws';
	var args = ['ec2', 'terminate-instances', '--instance-ids', instanceId];
	var terminateData = {};
	console.log(command, args);
	
	var terminate = spawn(command, args);

	terminate.stdout.on('data', function (data) {
		terminateData = JSON.parse(data.toString())["TerminatingInstances"][0]["CurrentState"]["Name"];
	});

	terminate.stderr.on('data', function (data) {
		callback(data.toString(), null);
	});

	terminate.on('error', function (error) {
		callback(error, null);
	});

	terminate.on('close', function (code, signal) {
		callback(null, terminateData);
	});
}

var cancelRequest = function (spotRequestId, callback) {
	var command = 'aws';
	var args = ['cancel-spot-instance-requests', '--spot-instance-request-ids', spotRequestId];
	var cancelData;
	console.log(command, args);
	
	var cancel = spawn(command, args);

	cancel.stdout.on('data', function (data) {
		cancelData = JSON.parse(data.toString())["CancelledSpotInstanceRequests"][0]["State"];
	});

	cancel.stderr.on('data', function (data) {
		callback(data.toString(), null);
	});

	cancel.on('error', function (error) {
		callback(error, null);
	});

	cancel.on('close', function (code, signal) {
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