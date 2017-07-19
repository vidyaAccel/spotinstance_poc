var fs 				= require('fs');
var mkdirp			= require('mkdirp');
var exec 			= require('child_process').exec;
var spawn 			= require('child_process').spawn;
var spotHistory 	= require("./spotPriceHistory.js");
var spotInstance 	= require("./spotInstance.js");

var terminate = false;

var getSpotInstance = function (jobName, accessKey, secretKey, inputData, callback) {
	var result = {};
	var date = new Date();
	var uniqueID = date.getDate() + '-' + (date.getMonth() + 1) + '-' + date.getFullYear() + '_' + date.getHours() + '-' + date.getMinutes() + '-' + date.getSeconds();
	var resultPath = process.env.HOME + '/workspace/resultsOfSpotPOC/' + uniqueID + '/result.json';
	spotHistory.getBidPrice(inputData, function (error, spotPrice, bidPrice) {
		if(error || !bidPrice) {
			console.log("Error in getting Bid Price:", error);
			return callback(error, null, resultPath, "Not Started");
		}
		console.log("Latest Spot Price is:", spotPrice);
		console.log("Lowest Bid Price will be:", bidPrice);

		inputData.SpotPrice = bidPrice;
		console.log("Authorizing Key:", __dirname+'/'+inputData.Specification.KeyName+'.pem');
		exec('chmod 400 '+__dirname+'/'+inputData.Specification.KeyName+'.pem', function (err, stdout, stderr) {
			if(err) {
				return callback(err, null, resultPath, "Not Started");
			}
			fs.readFile(__dirname + "/userData.txt", 'utf8', function (readErr, userData) {
				if(readErr) return callback(readErr, null, resultPath, "Not Started");
				var region = (inputData.Specification.Placement.AvailabilityZone).split("");
				region.pop();
				region = region.join("");
				data = "sudo docker run -e accessKey="+accessKey+" -e secretKey="+secretKey+" -e region="+region+" -e job="+jobName+" -i "+inputData.repository;
				userData += data;
				console.log("userData:\n", userData);
				var base64UserData = new Buffer(userData).toString('base64');
				inputData.Specification.UserData = base64UserData;

				spotInstance.requestSpotInstance(inputData, function (reqErr, requestId, requestState) {
					if(reqErr) return callback(reqErr, null, resultPath, "Not Started");
					
					spotInstance.getInstanceId(requestId, requestState, function (idErr, instanceId) {
						if(idErr) return callback(idErr, null, resultPath, "Running");
						
						spotInstance.getInstanceData(instanceId, function (instanceErr, instanceData) {
							if(instanceErr) return callback(instanceErr, null, resultPath, "Running");
							if (instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
								console.log("Instance Terminated");
								callback(null, instanceData, resultPath, "Terminated");
							} else if (instanceData.State.Name == 'running') {
								console.log('Sending back instance data and result file path......');
								callback(null, instanceData, resultPath, "Running");
								spotInstance.connectInstance(instanceData, inputData.Specification.KeyName, result, resultPath, function (result) {
									mkdirp(resultPath,function(){
										fs.writeFile(resultPath, result, function (err) {
											if(err) console.log("Couldn't write result file at ", resultPath);
										});
									});
								});
							}
						});
					});
				});
			});
		});
	});
}

var checkTermination = function (instanceData, callback) {
	if(terminate == false) {
		if(instanceData.State.Name == 'running') {
			exec('if curl -s http://'+instanceData.PublicIpAddress+'/latest/meta-data/spot/termination-time | grep -q .*T.*Z; then echo terminated; fi', function (tErr, tstdout, tstderr) {
				if(tstdout == "terminated") {
					return callback("Termination signal");
				}
				callback("Running");
			});
		} else if (instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
			callback("Terminated");
		}
	} else {
		callback("Terminating by User");
	}
}

var terminateAndCancel = function (instanceId, spotRquestType, callback) {
	terminate = true;
	var instance_terminate = function () {
		spotInstance.getInstanceData(instanceId, function (instanceErr, instanceData) {
			if(!instanceErr || instanceData) {
				if (instanceData.State.Name == 'terminated') {
					console.log("Instance Terminated");
					terminate = false;
					if(spotRquestType == 'persistent') {
						spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
							if(error || !cancel) {
								console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
								return callback(false);
							}
							callback(true);
						});
					} else callback(true);
				} else if (instanceData.State.Name == 'shutting-down') {
					setTimeout(function () { instance_terminate(); }, 2000);
				} else {
					spotInstance.terminateInstance(instanceData.InstanceId, function (err, termSig) {
						if(!err || termSig == 'terminated') {
							console.log("Instance Terminated");
							terminate = false;
							if(spotRquestType == 'persistent') {
								spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
									if(error || !cancel) {
										console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
										return callback(false);
									}
									callback(true);
								});
							} else callback(true);
						} else if(termSig == 'shutting-down') {
							setTimeout(function () { instance_terminate(); }, 2000);
						} else {
							terminate = false;
							if(spotRquestType == 'persistent') console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
							callback(false);
						}
					});
				}
			}
		});
	}
}

exports.getSpotInstance = getSpotInstance;
exports.checkTermination = checkTermination;
exports.terminateAndCancel = terminateAndCancel;