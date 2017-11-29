var exec 		= require('child_process').exec;
var spawn 		= require('child_process').spawn;
var spawnSync 	= require('child_process').spawnSync;
var utils 		= require('./utils.js');


var AWS, ec2;

try {
	AWS = require('aws-sdk');
	utils.getCredential(function (error, accessKey, secretKey, config) {
		if(error) throw error;
		AWS.config.update(config);
		ec2 = new AWS.EC2();
	});
} catch (error) {
	console.log("ERROR:", error, '\n Please run "npm install aws-sdk" to solve this error.');
}

var requestSpotInstance = function (inputData, callback) {
	console.log("Making Request For a Spot Instance...");

	var spotCommand, specification, requestId, requestState;

	//specification = JSON.stringify(JSON.stringify(inputData.Specification));
	var params = {
		SpotPrice: inputData.SpotPrice,
		InstanceCount: inputData.InstanceCount,
		Type: inputData.RequestType,
		LaunchSpecification: inputData.Specification
	};

	ec2.requestSpotInstances(params, function (err, data) {
		if(err || !data) return callback(err.stack, null, null);
		var requestData = data['SpotInstanceRequests'][0];
		console.log("Spot Instance Request Data:\n", requestData);
		requestId = requestData.SpotInstanceRequestId;
		requestState = requestData.State;
		callback(null, requestId, requestState);
	});

	/*spotCommand = "aws ec2 request-spot-instances --spot-price " + inputData.SpotPrice + " --instance-count " + inputData.InstanceCount + " --type " + inputData.RequestType + " --launch-specification " + specification;

	console.log(spotCommand);
	exec(spotCommand, function (reqErr, stdout, stderr) {
		if(reqErr || stderr || !stdout) return callback(reqErr, null, null);
		var requestData = JSON.parse(stdout)['SpotInstanceRequests'][0];
		console.log("Spot Instance Request Data:\n", requestData);
		requestId = requestData.SpotInstanceRequestId;
		requestState = requestData.State;
		callback(null, requestId, requestState);
	});*/
}

var getInstanceId = function (requestId, requestState, callback) {
	console.log("Waiting for fulfillment of spot instance request.....");
	var requestState = requestState;
	var requestData;
	var iterateGetInstanceid = function (id) {
		var params = {
			SpotInstanceRequestIds: [id]
		}

		ec2.describeSpotInstanceRequests(params, function (err, data) {
			if(err || !data) return callback(err, null);
			requestData = data['SpotInstanceRequests'][0];
			requestState = requestData.State;
		});

		if(requestState == 'open') {
			setTimeout(function () {
				iterateGetInstanceid(requestData.SpotInstanceRequestId);
			}, 10*1000);
		} else if(requestState == 'active') {
			if(requestData.Status.Code == 'fulfilled') {
				var instanceId = requestData.InstanceId;
				console.log("spot instance request fulfilled.....\nspot instance id:", instanceId);
				return callback(null, instanceId)
			} else {
				setTimeout(function () {
					iterateGetInstanceid(requestData.SpotInstanceRequestId);
				}, 10*1000);
			}
		} else if(requestData.State == 'closed' || requestData.State == 'cancelled') {
			return callback(requestData.Status.Code, null);
		}
		/*var spotCommand = 'aws ec2 describe-spot-instance-requests --spot-instance-request-ids ' + id;
		
		console.log(''+spotCommand);
		exec(spotCommand, function (reqErr, stdout, stderr) {
			if(reqErr || stderr || !stdout) return callback(reqErr, null);
			requestData = JSON.parse(stdout)['SpotInstanceRequests'][0];
			requestState = requestData.State;
		});
		if(requestState == 'open') {
			setTimeout(function () {
				iterateGetInstanceid(requestData.SpotInstanceRequestId);
			}, 10*1000);
		} else if(requestState == 'active') {
			if(requestData.Status.Code == 'fulfilled') {
				var instanceId = requestData.InstanceId;
				console.log("spot instance request fulfilled.....\nspot instance id:", instanceId);
				return callback(null, instanceId)
			} else {
				setTimeout(function () {
					iterateGetInstanceid(requestData.SpotInstanceRequestId);
				}, 10*1000);
			}
		} else if(requestData.State == 'closed' || requestData.State == 'cancelled') {
			return callback(requestData.Status.Code, null);
		}*/
	}
	iterateGetInstanceid(requestId);
}

var getInstanceData = function (instanceId, callback) {
	console.log("Getting instance state of :", instanceId);
	var spotCommand, spotCommandArgs, instanceData, instance;

	var params = {
		InstanceIds: [instanceId]
	}
	ec2.describeInstances(params, function (err, data) {
		if(err || !data) return callback(err, null);
		instanceData = data['Reservations'][0]['Instances'][0];
		console.log("Spot Instance State:\n", instanceData.State.Name);
		if(instanceData.State.Name == 'pending' || instanceData.State.Name == 'shutting-down') getInstanceData(instanceData.InstanceId, callback);
		else callback(null, instanceData);
	});
	/*spotCommand = 'aws';
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
	}*/
}


var connectInstance = function (keyName, result, callback) {
	console.log("Connecting to Instance....")
	instanceData = instance;
	
	setTimeout(function () {
		var sshCommand, sshCommandArgs, connect, connectData;
		var output = 'cat /home/ubuntu/user-data.log';

		if(instanceData.State.Name == 'running') {
			sshCommand = 'ssh';
			sshCommandArgs = ['-i', __dirname+'/'+keyName+'.pem', '-oStrictHostKeyChecking=no', 'ubuntu@'+instanceData.PublicDnsName, output];

			connect = spawn(sshCommand, sshCommandArgs, { maxBuffer: 200*1024*1024,
				/*stdio: [
			    	0, // Doesn't use parent's stdin for child
			    	'pipe', // Direct child's stdout to an array output at index 1
			    	'pipe' // Direct child's stderr to an array output at index 2
			  	],*/
			  	timeout: 10000,
			  	killSignal: 'SIGKILL',
			  	encoding: 'UTF-8'
			});

			/*if(connect.error || connect.output[2]) {
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
				} else connectInstance(keyName, result, callback);
			} else {
				if(connect.signal == 'SIGKILL') {
					console.log("Instance Terminated, couldn't connect to get result.");
					result.success.push("\nInstance Terminated\n");
					result.error.push("\nInstance Terminated\n");
					return callback(result, instanceData);
				} else connectInstance(keyName, result, callback);
			}*/
			connect.on('error', function (error) {
				if(!result.error.includes(error.message)) result.error.push(error.message);
			});

			connect.stdout.on('data', function (data) {
				connectData = data.toString();
				if(!result.error.includes(connectData)) result.success.push(connectData);
				console.log('Logs of job running in spot Instance:\n'+connectData);
			});

			connect.stderr.on('data', function (data) {
				if(!result.error.includes(data.toString())) result.error.push(data.toString());
			});

			connect.on('close', function (code, signal) {
				if(code == 0 && signal == null) {
					if(connectData.includes('Completed All Jobs')) {
						result.success = [connectData];
						console.log('Logs of job running in spot Instance:\n'+result.success+'\nError of running jobs in spot instance:\n'+result.error);
						return callback(result, instanceData);
					} else if(result.error.includes('Connection refused')) {
						console.log('Logs of job running in spot Instance:\n'+result.success+'\nError of running jobs in spot instance:\n'+result.error);
						return callback(result, instanceData);
					} else connectInstance(keyName, result, callback);
				} else {
					if(signal === 'SIGKILL') {
						console.log("Couldn't connect instance to get result.");
						result.success.push("\nInstance Terminated\n");
						result.error.push("\nInstance Terminated\n");
						return callback(result, instanceData);
					} else connectInstance(keyName, result, callback);
				}
			});
		} else if(instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated' || instance_terminated[instanceData.InstanceId] == true) {
			console.log("Instance Terminated, couldn't connect to get result.");
			result.success.push("\nInstance Terminated\n");
			result.error.push("\nInstance Terminated\n");
			return callback(result, instanceData);
		}
	}, 2000);
}

var terminateInstance = function (instanceId, callback) {
	console.log("Terminating instance....");
	var params = {
		InstanceIds: [instanceId]
	}

	ec2.terminateInstances(params, function (err, data) {
		if(err || !data) return callback(err, null);
		var terminateData = data["TerminatingInstances"][0]["CurrentState"]["Name"];
		callback(null, terminateData);
	});
	/*var command = 'aws ec2 terminate-instances --instance-ids ' + instanceId;
	console.log(command);

	exec(command, function (termErr, stdout, stderr) {
		if(termErr || stderr || !stdout) return callback(termErr, null);
		var terminateData = JSON.parse(stdout)["TerminatingInstances"][0]["CurrentState"]["Name"];
		callback(null, terminateData);
	});*/
}

var cancelRequest = function (spotRequestId, callback) {
	console.log("Cancelling spot instance request....");
	var params = {
		SpotInstanceRequestIds: [spotRequestId]
	}

	ec2.cancelSpotInstanceRequests(params, function (err, data) {
		if(err || !data) return callback(err, null);
		var cancelData = data["CancelledSpotInstanceRequests"][0]["State"];
		if(cancelData == 'cancelled') callback(null, true);
		else callback(true, false);
	});
	/*var command = 'aws ec2 cancel-spot-instance-requests --spot-instance-request-ids ' + spotRequestId;
	console.log(command);
	
	exec(command, function (cancelErr, stdout, stderr) {
		if(cancelErr || stderr || !stdout) return callback(true, null);
		var cancelData = JSON.parse(stdout)["CancelledSpotInstanceRequests"][0]["State"];
		if(cancelData == 'cancelled') callback(null, true);
		else callback(true, false);
	});*/
}


var increase = function (spotPrice, increment) {
	var price = parseFloat(spotPrice).toFixed(4);
	return ((parseFloat(price) + parseFloat('0.000'+increment)).toFixed(4)).toString();
}

var getBidPrice = function (inputData, callback) {
	console.log("Getting Spot Price History...");
	var spotCommand, spotPrice, bidPrice;
	
	var now = new Date();
	var endTime = new Date(now).toISOString();
	var params = {
		AvailabilityZone: inputData.Specification.Placement.AvailabilityZone,
		InstanceTypes: [inputData.Specification.InstanceType],
		ProductDescriptions: [inputData.Platform],
		MaxResults: 10,
		EndTime: endTime
	}

	ec2.describeSpotPriceHistory(params, function (err, data) {
		if(!err || data) {
			var spotPrices = data['SpotPriceHistory'];
			console.log("Last 10 Spot Prices:\n", spotPrices);
			spotPrice = spotPrices[0].SpotPrice;
			bidPrice = increase(spotPrice, inputData.Increment);
			return callback(null, spotPrice, bidPrice);
		} else return callback(err, null, null);
	});

	/*spotCommand = 'aws ec2 describe-spot-price-history --availability-zone ' + inputData.Specification.Placement.AvailabilityZone + ' --instance-types ' + inputData.Specification.InstanceType + ' --product-descriptions ' + inputData.Platform + ' --max-items 10 --end-time ' + endTime;

	console.log(spotCommand);
	exec(spotCommand, {maxBuffer: 200 * 1024 * 1024}, function (error, stdout, stderr) {
		if(!error || stdout) {
			var spotPrices = JSON.parse(stdout)['SpotPriceHistory'];
			console.log("Last 10 Spot Prices:\n", spotPrices);
			spotPrice = spotPrices[0].SpotPrice;
			bidPrice = increase(spotPrice, inputData.Increment);
			return callback(null, spotPrice, bidPrice);
		} else if(JSON.stringify(error).includes('timeout')) getBidPrice(inputData, callback);
		else return callback(error, null, null);
	});*/
}

var checkTermination = function (instanceData, callback) {
	if(instanceData && instance_terminated[instanceData.InstanceId] == false) {	
		if(terminate == false) {
			if(instanceData.State.Name == 'running') {
				var timeOut = {timeout: 5000,killSignal: 'SIGKILL'}
				exec('if curl -s http://'+instanceData.PublicIpAddress+'/latest/meta-data/spot/termination-time | grep -q .*T.*Z; then echo terminated; fi', timeOut, function (tErr, tstdout, tstderr) {
					if(tstdout == "terminated") {
						return callback("Termination signal");
					}
					callback("Running");
				});
			} else if (instanceData.State.Name == 'terminated') {
				callback("Terminated");
			}
		} else {
			if (instanceData.State.Name == 'terminated') return callback("Terminated");
			callback("Terminating by User");
		}
	} else callback('Terminated');
}

exports.checkTermination = checkTermination;
exports.getBidPrice = getBidPrice;
exports.requestSpotInstance = requestSpotInstance;
exports.getInstanceId = getInstanceId;
exports.getInstanceData = getInstanceData;
exports.connectInstance = connectInstance;
exports.terminateInstance = terminateInstance;
exports.cancelRequest = cancelRequest;
