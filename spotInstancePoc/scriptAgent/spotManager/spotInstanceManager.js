var fs 				= require('fs');
var mkdirp			= require('mkdirp');
var exec 			= require('child_process').exec;
var spawn 			= require('child_process').spawn;
var spotInstance 	= require("../scriptAgentUtils/spotInstanceUtils");

var reRequest = false;
var getSpotInstance = function (jobName, accessKey, secretKey, inputData, resultPath, callback) {
	var result = [], reResult = {};
	reResult['success'] = [];
	reResult['error'] = [];
	var resultFilePath, resultFile;
	if(resultPath.length == 0) {
		var date = new Date();
		var uniqueID = date.getDate() + '-' + (date.getMonth() + 1) + '-' + date.getFullYear() + '_' + date.getHours() + '-' + date.getMinutes() + '-' + date.getSeconds();
		resultFilePath = process.env.HOME + '/workspace/resultsOfSpotPOC/' + uniqueID;
		resultFile = resultFilePath + '/result.json';
	} else {
		reRequest = true;
		var temp = resultPath[0].split('/');
		temp.pop();
		resultFilePath = temp.join('/');
		resultFile = resultPath[0];
		fs.readFile(resultFile, 'utf8', function (err, data) {
			if(!err || data) result = result.concat(JSON.parse(data)); 
		});
	}
	spotInstance.getBidPrice(inputData, function (error, spotPrice, bidPrice) {
		if(error || !bidPrice) {
			console.log("Error in getting Spot Price:", error);
			return callback(error, null, resultFile, "Not Started");
		}
		console.log("Latest Spot Price is:", spotPrice);
		console.log("Lowest Bid Price will be:", bidPrice);

		inputData.SpotPrice = bidPrice;
		exec('chmod 400 '+__dirname+'/../scriptAgentUtils/'+inputData.Specification.KeyName+'.pem', function (err, stdout, stderr) {
			if(err) {
				return callback(err, null, resultFile, "Not Started");
			}
			fs.readFile(__dirname + "/../scriptAgentUtils/userData.txt", 'utf8', function (readErr, userData) {
				if(readErr) return callback(readErr, null, resultFile, "Not Started");
				var region = (inputData.Specification.Placement.AvailabilityZone).split("");
				region.pop();
				region = region.join("");
				data = 'sudo docker run -e accessKey='+accessKey+' -e secretKey='+secretKey+' -e region='+region+' -e job='+jobName+' -p 4000:80 -i '+inputData.repository+' | tee -a "$logfile\"';
				userData += data;
				console.log("userData:\n", userData);
				var base64UserData = new Buffer(userData).toString('base64');
				inputData.Specification.UserData = base64UserData;

				spotInstance.requestSpotInstance(inputData, function (reqErr, requestId, requestState) {
					if(reqErr) return callback(reqErr, null, resultFile, "Not Started");
					
					spotInstance.getInstanceId(requestId, requestState, function (idErr, instanceId) {
						if(idErr) return callback(idErr, null, resultFile, "Running");
						
						spotInstance.getInstanceData(instanceId, function (instanceErr, instanceData) {
							if(instanceErr) return callback(instanceErr, null, resultFile, "Running");
							if (instanceData.State.Name == 'shutting-down' || instanceData.State.Name == 'terminated') {
								console.log("Instance Terminated");
								callback(null, instanceData, resultFile, "Terminated");
							} else if (instanceData.State.Name == 'running' || instanceData.State.Name == 'pending') {
								completed[instanceData.InstanceId] = false;
								callback(null, instanceData, resultFile, "Running");
								mkdirp(resultFilePath,function() {
									setTimeout(function () {
										spotInstance.connectInstance(inputData.Specification.KeyName, reResult, function (res, instanceData) {
											result.push(res);
											fs.writeFile(resultFile, JSON.stringify(result), function (err) {
												if(err) console.log("Couldn't write result file at ", resultFile);
												completed[instanceData.InstanceId] = true;
											});
										});
									}, 120000);
								});
							}
						});
					});
				});
			});
		});
	});
}

var terminateAndCancel = function (instanceId, spotRquestType, callback) {
	terminate = true;
	var instance_terminate = function () {
		spotInstance.getInstanceData(instanceId, function (instanceErr, instanceData) {
			if(!instanceErr || instanceData) {
				if (instanceData.State.Name == 'terminated') {
					console.log("Instance Terminated by Q monitor after All jobs finished.");
					//if(spotRquestType == 'persistent') {
						spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
							terminate = false;
							if(error || !cancel) {
								console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
								return callback(false);
							}
							callback(true);
						});
					//} else callback(true);
				} else if (instanceData.State.Name == 'shutting-down') {
					setTimeout(function () { instance_terminate(); }, 2000);
				} else {
					spotInstance.terminateInstance(instanceData.InstanceId, function (err, termSig) {
						if(!err || termSig == 'terminated') {
							console.log("Instance Terminated by Q monitor after All jobs finished.");
							//if(spotRquestType == 'persistent') {
								spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
									terminate = false;
									if(error || !cancel) {
										console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
										return callback(false);
									}
									callback(true);
								});
							//} else callback(true);
						} else if(termSig == 'shutting-down') {
							setTimeout(function () { instance_terminate(); }, 2000);
						} else {
							terminate = false;
							console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
							callback(false);
						}
					});
				}
			}
		});
	}
	instance_terminate();
}

exports.getSpotInstance = getSpotInstance;
exports.terminateAndCancel = terminateAndCancel;
