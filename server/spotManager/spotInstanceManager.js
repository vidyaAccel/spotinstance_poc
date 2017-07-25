var fs 				= require('fs');
var mkdirp			= require('mkdirp');
var exec 			= require('child_process').exec;
var spawn 			= require('child_process').spawn;
var spotHistory 	= require("./spotPriceHistory.js");
var spotInstance 	= require("./spotInstance.js");

var terminate = false;

var getSpotInstance = function (jobName, accessKey, secretKey, inputData, resultPath, callback) {
	var result = {};
	result['success'] = [];
	result['error'] = [];
	var resultFilePath, resultFile;
	console.log("resultFile:", resultPath.length);
	if(resultPath.length == 0) {
		var date = new Date();
		var uniqueID = date.getDate() + '-' + (date.getMonth() + 1) + '-' + date.getFullYear() + '_' + date.getHours() + '-' + date.getMinutes() + '-' + date.getSeconds();
		resultFilePath = process.env.HOME + '/workspace/resultsOfSpotPOC/' + uniqueID;
		resultFile = resultFilePath + '/result.json';
	} else {
		var temp = resultPath[0].split('/');
		temp.pop();
		resultFilePath = temp.join('/');
		resultFile = resultPath[0];
		fs.readFile(resultFile, 'utf8', function (err, data) {
			if(!err || data) result = JSON.parse(data); 
		});
	}
	spotHistory.getBidPrice(inputData, function (error, spotPrice, bidPrice) {
		if(error || !bidPrice) {
			console.log("Error in getting Bid Price:", error);
			return callback(error, null, resultFile, "Not Started");
		}
		console.log("\n=========================================\nLatest Spot Price is:", spotPrice);
		console.log("Lowest Bid Price will be:", bidPrice+'\n=========================================\n');

		inputData.SpotPrice = bidPrice;
		console.log("Authorizing Key:", __dirname+'/'+inputData.Specification.KeyName+'.pem');
		exec('chmod 400 '+__dirname+'/'+inputData.Specification.KeyName+'.pem', function (err, stdout, stderr) {
			if(err) {
				return callback(err, null, resultFile, "Not Started");
			}
			fs.readFile(__dirname + "/userData.txt", 'utf8', function (readErr, userData) {
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
								console.log('Got instance data and result file path......', resultFile);
								callback(null, instanceData, resultFile, "Running");
								mkdirp(resultFilePath,function(){
									console.log("\n=========================================\nRunning Jobs in instance.\nPlease wait for Jobs to complete......\n=========================================\n");
									setTimeout(function () {	
										spotInstance.connectInstance(instanceData, inputData.Specification.KeyName, result, function (result, instanceData) {
											fs.writeFile(resultFile, JSON.stringify(result), function (err) {
												if(err) console.log("Couldn't write result file at ", resultFile);
												completed = true;
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

var checkTermination = function (instanceData, callback) {
	console.log('\n=========================================\nChecking terminate request from AWS\n=========================================\n')
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
}

var terminateAndCancel = function (instanceId, spotRquestType, callback) {
	terminate = true;
	var instance_terminate = function () {
		spotInstance.getInstanceData(instanceId, function (instanceErr, instanceData) {
			if(!instanceErr || instanceData) {
				if (instanceData.State.Name == 'terminated') {
					console.log("\n=========================================\nInstance Terminated by Q monitor after job finished.\n=========================================\n");
					//if(spotRquestType == 'persistent') {
						spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
							terminate = false;
							if(error || !cancel) {
								console.log("\n=========================================\nCouldn't Cancel Spot Request. Please Try Manually in AWS Console!!\n=========================================\n");
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
							console.log("\n=========================================\nInstance Terminated by Q monitor after job finished.\n=========================================\n");
							//if(spotRquestType == 'persistent') {
								spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
									terminate = false;
									if(error || !cancel) {
										console.log("\n=========================================\nCouldn't Cancel Spot Request. Please Try Manually in AWS Console!!\n=========================================\n");
										return callback(false);
									}
									callback(true);
								});
							//} else callback(true);
						} else if(termSig == 'shutting-down') {
							setTimeout(function () { instance_terminate(); }, 2000);
						} else {
							terminate = false;
							console.log("\n=========================================\nCouldn't Cancel Spot Request. Please Try Manually in AWS Console!!\n=========================================\n");
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
exports.checkTermination = checkTermination;
exports.terminateAndCancel = terminateAndCancel;