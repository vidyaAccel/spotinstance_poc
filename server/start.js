var fs 			= require('fs');
var common 		= require('../utils/common.js');
var spotManager = require('./spotManager/spotInstanceManager.js');
var spotInstance = require('./spotManager/spotInstance.js');

var AWS, sqs, s3Bucket;

try {
	AWS = require('aws-sdk');
	sqs = new AWS.SQS({region:'us-west-2'});
	s3Bucket = new AWS.S3( { params: {Bucket: 'tsgpoc'} } );
} catch (error) {
	console.log("ERROR:", error, '\n Please run "npm install aws-sdk" to solve this error.');
}

var jobArray = (process.argv.jobs).split(",");
var waitTime = parseInt(process.argv.time);

var inputData = {};
var instance = {};

console.log(jobArray, time);

inputData.Platform = 'Linux/UNIX';
inputData.Increment = 1;
inputData.Specification = {};
inputData.Specification.InstanceType = 'm3.medium';
inputData.Specification.Placement = {};
inputData.Specification.Placement.AvailabilityZone = 'us-west-2a';
inputData.repository = 'spotpoc/poc:v29';
inputData.RequestType = 'one-time';
inputData.InstanceCount = '1';
inputData.Specification.ImageId = 'ami-5b4c5d22';
inputData.Specification.SecurityGroupIds = ['sg-42558938'];
inputData.Specification.KeyName = 'tsgpoc-key';
inputData.Specification.Monitoring = {};
inputData.Specification.Monitoring.Enabled = true;
inputData.Specification.UserData = '`cat '+__dirname+'/spotManager/userData.txt | base64 -w 0`';

var getCredential = function(callback) {
	fs.readFile('~/.aws/credentials', 'utf-8', function (error, data) {
		if(error || !data) {
			console.log("Please install and configure awscli... Then start the job.");
			return callback(true, null, null);
		}
		var newData = data.split('\n');
		var accessKey = newData[1].split('= ')[1];
		var secretKey = newData[2].split('= ')[1];
		AWS.config.update({accessKeyId: accessKey, secretAccessKey: secretKey});
		callback(null, accessKey, secretKey);
	});
}

var startJobs = function (jobArray) {
	var jobName = jobArray.join("#");
	getCredential(function (error, accessKey, secretKey) {
		if(error) return;
		console.log(jobName, accessKey, secretKey);
		spotManager.getSpotInstance(jobName, accessKey, secretKey, inputData, function (err, instanceData) {
			if(err || !instanceData) console.log({error:err || 'Jobs Not Started'});
			else instance = instanceData;
		}, function (terminate) {
			if(terminate == "Terminated") {
				console.log("Spot Instance Terminated");
			} else {
				new checkSpotInstanceStatus(terminate, function (termSig) {
					if(termSig == 'Terminated') {
						console.log("Spot Instance Terminated");
						return;
					}
				});
			}
		});
	});
}

var checkSpotInstanceStatus = function(termSig, callback) {
	if(termSig == "Terminated") {
		console.log("Spot Instance Terminated");
		callback('Terminated');
	} else {
		if(termSig == "Termination signal") {
			var startTm. = new Date().getTime();
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
			if(termSig == "Terminating by User") console.log("Terminating Spot Instance");
			spotManager.checkTermination(instance, function (terminate) {
				setTimeout(function () { checkSpotInstanceStatus(terminate, callback); }, 5000);
			});
		}
	}
}

var sqsMonitor = function(jobArray) {
	setTimeout(function () {
	  	var jobFinished = [];
	  	var jobPending = [];
	  	sqs.receiveMessage({
	    	QueueUrl: "https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc",
	    	VisibilityTimeout: 60, // seconds - how long we want a lock on this job
	    	WaitTimeSeconds: 3 // seconds - how long should we wait for a message?
	 	}, function(err, data) {
	      	if (data.Messages) {
	       		common.each(data.Messages, function(message, job_callback) {
	          		var jobname = JSON.parse(message.Body).jobname;
	          		if(!jobArray.includes(jobname)) jobFinished.push(jobname);
	          		else jobPending.push(jobname);
	          		job_callback();
	        	}, function(err) {
	        		console.log("Total Jobs:", jobArray.length);
	        		if(jobPending.length > 0) {
		            	spotInstance.getInstanceData(instance.InstanceId, function (instanceErr, instanceData) {
							if(instanceErr || instanceData.State.Name == 'terminated') {
								console.log("Spot Instance Terminated. Jobs Finished:", jobFinished.length, "\nPending Jobs:", jobPending.length, "\nStarted Pending Jobs.");
								var newjob = new startJobs(jobPending);
							} else {
								console.log("Waiting for Jobs to Complete.", jobPending);
								var newqueue = new sqsMonitor(jobArray);
							}
						});
		            } else if(jobFinished.length == jobArray.length) {
		            	spotInstance.getInstanceData(instance.InstanceId, function (instanceErr, instanceData) {
		            		if(instanceErr || instanceData.State.Name == 'terminated') {
								console.log("Spot Instance Terminated. All Jobs Completed.\nCompleted Jobs:", jobFinished.length);
								jobArray.forEach(function (job) {
									console.log("Click Here-> https://tsgpoc.s3-us-west-2.amazonaws.com/" + job + "thumb.jpg to see converted image.");
								});
								return;
							} else {
								console.log("All Jobs Completed. Terminating Spot Instance.\nCompleted Jobs:", jobFinished.length);
								spotManager.terminateAndCancel(instance.InstanceId, inputData.RequestType, function (terminated) {
									if(terminated) {
										console.log("Spot Instance Terminated");
										jobArray.forEach(function (job) {
											console.log("Click Here-> https://tsgpoc.s3-us-west-2.amazonaws.com/" + job + "thumb.jpg to see converted image.");
										});
										return;
									} else {
										console.log("Couldn't Terminate Spot Instance. Please Try Manually in AWS Console!!");
										return;
									}
								})
							}
		            	});
		            }
	        	});
	      	}
	   	});
	}, waitTime);
}

var job = new startJobs(jobArray);
var queue = new sqsMonitor(jobArray);