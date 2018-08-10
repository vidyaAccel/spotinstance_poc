var utils = require('../scriptAgentUtils/utils.js');
var spotManager = require('../spotManager/spotInstanceManager.js');
var spotInstance = require('../scriptAgentUtils/spotInstanceUtils');
var inputData = require('../config');

var startJobs = function (jobArray, resultPath, callback) {
	var jobName = jobArray.join("#");
	utils.getCredential(function (error, accessKey, secretKey) {
		if(error) return;
		spotManager.getSpotInstance(jobName, accessKey, secretKey, inputData, resultPath, function (err, instanceData, resultFilePath, terminate) {
			if(err || !instanceData) {
				console.log({error:err || 'Jobs Not Started'});
				callback("not started");
			} else {
				instance_terminated[instanceData.InstanceId] = false;
				instance = instanceData;
				if(!resultPath.includes(resultFilePath)) resultPath.push(resultFilePath);
				console.log("Got instance Data:\n"+JSON.stringify(instance));
				console.log("Launching Spot Instance.......\nMonitoring Jobs..."+jobArray);
				
				checkSpotInstanceStatus(terminate, function (termSig) {
					if(termSig == 'Terminated') {
						instance_terminated[instance.InstanceId] = true;
						callback(termSig);
					}
				});
			}
		});
	});
}

var checkSpotInstanceStatus = function(termSig, callback) {
	if(termSig == "Terminated") {
		console.log("Spot Instance Terminated. Not checking for AWS termination Request.");
		callback('Terminated');
	} else {
		if(termSig == "Termination signal") {
			
			var startTm = new Date().getTime();
			var diff = 0;
			var subcheck = function () {
				var endTm = new Date().getTime();
				diff = ((endTm - startTm)/1000) + (120-diff);
				console.log("Instance will terminate in" + diff + "seconds. Please save your work");
				if(120-diff == 0) {
					checkSpotInstanceStatus("Terminated", callback);
				} else setTimeout(function () { subcheck(); }, 1000);
			}
		} else {
			if(termSig == "Terminating by User" && instance.State.Name != 'terminated') console.log("Terminating Spot Instance");
			spotInstance.checkTermination(instance, function (terminate) {
				setTimeout(function () { checkSpotInstanceStatus(terminate, callback); }, 5000);
			});
		}
	}
}

module.exports.startJobs = startJobs;