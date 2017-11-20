var fs 			 = require('fs');
var exec 		 = require('child_process').exec;
var common 		 = require('../utils/common.js');
var spotManager  = require('./spotManager/spotInstanceManager.js');
var spotInstance = require('./spotManager/spotInstance.js');

var AWS, sqs, s3Bucket, resultPath = [];

global.completed = {};
global.instance_terminated = {};

try {
	AWS = require('aws-sdk');
	sqs = new AWS.SQS({region:'us-west-2'});
	s3Bucket = new AWS.S3( { params: {Bucket: 'tsgpoc'} } );
} catch (error) {
	console.log("ERROR:", error, '\n Please run "npm install aws-sdk" to solve this error.');
}

var jobArray;
var finishedJobs = [];
var waitTime;
var inputData = {};
var instance;
var Qmessages = [];
var runningJob = false;

inputData.Platform = 'Linux/UNIX';
inputData.Increment = 1;
inputData.Specification = {};
inputData.Specification.InstanceType = "m3.medium";
inputData.Specification.Placement = {};
inputData.Specification.Placement.AvailabilityZone = "us-west-2a";
inputData.repository = 'spotpoc/poc:v35';
inputData.RequestType = 'one-time';
inputData.InstanceCount = '1';
inputData.Specification.ImageId = "ami-5b4c5d22";
inputData.Specification.SecurityGroupIds = ["sg-42558938"];
inputData.Specification.KeyName = "tsgpoc-key";
inputData.Specification.Monitoring = {};
inputData.Specification.Monitoring.Enabled = true;

var getCredential = function(callback) {
	fs.readFile(process.env.HOME+'/.aws/credentials', 'utf-8', function (error, data) {
		if(error || !data) {
			console.log("Please install and configure awscli... Then start the job.", error);
			return callback(error, null, null);
		}
		var newData = data.split('\n');
		var accessKey = newData[1].split('= ')[1];
		var secretKey = newData[2].split('= ')[1];
		AWS.config.update({accessKeyId: accessKey, secretAccessKey: secretKey});
		callback(null, accessKey, secretKey);
	});
}

var getResult = function(path, callback) {
	fs.readFile(path, 'utf-8', function (error, data) {
		if(error || !data) {
			console.log("No result found.....:", error);
			return callback(error);
		}
		var result = JSON.parse(data);
		callback(null, result);
	});
}

var startJobs = function (jobArray, resultPath, callback) {
	var jobName = jobArray.join("#");
	getCredential(function (error, accessKey, secretKey) {
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
			spotManager.checkTermination(instance, function (terminate) {
				setTimeout(function () { checkSpotInstanceStatus(terminate, callback); }, 5000);
			});
		}
	}
}

var sqsMonitor = function(jobArray, waitTime, callback) {
	setTimeout(function () {
		console.log("inside Qmonitor");
	  	var jobFinished = [];
	  	var jobPending = [];
	  	sqs.receiveMessage({
	    	QueueUrl: "https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc",
	    	VisibilityTimeout: 60, // seconds - how long we want a lock on this job
	    	WaitTimeSeconds: 3 // seconds - how long should we wait for a message?
	 	}, function(err, data) {
	      	if(data.Messages) {
	      		console.log("received a Message\n", err, JSON.stringify(data));
	       		common.each(data.Messages, function(message, job_callback) {
	       			console.log("inside each message");
	          		var jobname = JSON.parse(message.Body).jobname;
	          		var id = message.MessageId;
	          		var handler = message.ReceiptHandle
	          		var Qmessage = JSON.stringify({"Id": id, "ReceiptHandle": handler});
	          		Qmessages.push(Qmessage);
	          		
	          		if(jobArray.includes(jobname) && !jobFinished.includes(jobname)) {
	          			console.log("adding "+jobname+" to finished job");
	          			jobFinished.push(jobname);
	          			if(!finishedJobs.includes(jobname)) finishedJobs.push(jobname);
	          		}
          			if(jobPending.includes(jobname)) {
          				jobPending.forEach(function (job, i) {
          					if(jobname == jobPending[i]) {
          						console.log("removed "+jobname+" from pending job");
          						jobPending.splice(i,1);
          					}
          				});
          			}
	          		jobArray.forEach(function (job) {
	          			if(!jobFinished.includes(job) && !jobPending.includes(job)) {
	          				console.log("adding "+job+" to pending jobs");
	          				jobPending.push(job);
	          			}
	          		});
	          		
	          		job_callback();
	        	}, function(err) {
	        		console.log("Total Jobs:", jobArray);
	        		console.log("Pending jobs:", jobPending);
	        		console.log("Finished jobs", finishedJobs);
	        		if(jobPending.length > 0) {
		            	if(instance && instance_terminated[instance.InstanceId] == false) {
				      		spotInstance.getInstanceData(instance.InstanceId, function (instanceErr, instanceData) {
								instance = instanceData;
								if(instanceData.State.Name == 'terminated') {
									spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
										if(error || !cancel) {
											console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
											sqsMonitor(jobPending, waitTime, callback);
										} else {
											instance_terminated[instanceData.InstanceId] = true;
											completed[instanceData.InstanceId] = false;
											console.log("Spot Instance Terminated in between Job Running. Jobs Finished:", finishedJobs, "\nPending Jobs:", jobPending, "\nStarting Pending Jobs in new spot instance..");
											setTimeout(function () {
												startJobs(jobPending, resultPath, function (sig) {
													if(sig == 'not started') console.log("Jobs Not started due to some error.");
													else console.log("Pending Job finished. Spot Instance Terminated");
												});
												sqsMonitor(jobPending, waitTime, callback);
											}, 10000);
										}
									});
								} else {
									console.log("Waiting for Jobs to Complete.", jobPending);
									if(completed[instanceData.InstanceId]) console.log("Waiting for result to update....");
									sqsMonitor(jobPending, waitTime, callback);
								}
							});
						} else sqsMonitor(jobPending, waitTime, callback);
		            } else if(jobFinished.length == jobArray.length) {
		            	if(completed[instance.InstanceId]) {
		            		completed[instance.InstanceId] = false;
			            	deleteMessage("https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc", Qmessages, function() {});
			            	spotInstance.getInstanceData(instance.InstanceId, function (instanceErr, instanceData) {
			            		instance = instanceData;
								console.log("All Jobs completed. Terminating Spot Instance.\ncompleted Jobs:", finishedJobs);
								spotManager.terminateAndCancel(instance.InstanceId, inputData.RequestType, function (terminated) {
									if(terminated) {
										instance_terminated[instanceData.InstanceId] = true;
										console.log("Spot Instance Terminated");
										getResult(resultPath[0], function (err, result) {
											finishedJobs.forEach(function (job) {
												result[result.length-1].success += '<a href="https://tsgpoc.s3-us-west-2.amazonaws.com/'+job+'.gif">Open this link to download '+job+'.gif</a><br/>';
											});
											fs.writeFile(resultPath[0], JSON.stringify(result), 'utf8', function (err) {
												callback("finished", resultPath[0].split("/")[resultPath[0].split("/").length-2]);
											});
										});
									} else {
										console.log("Couldn't Terminate Spot Instance. Please Try Manually in AWS Console!!");
										getResult(resultPath[0], function (err, result) {
											finishedJobs.forEach(function (job) {
												result[result.length-1].success += '<a href="https://tsgpoc.s3-us-west-2.amazonaws.com/'+job+'.gif">Open this link to download '+job+'.gif</a><br/>';
											});
											fs.writeFile(resultPath[0], JSON.stringify(result), 'utf8', function (err) {
												callback("Not Finished", resultPath[0].split("/")[resultPath[0].split("/").length-2]);
											});
										});
									}
								});
			            	});
						} else sqsMonitor(finishedJobs, waitTime, callback);
		            }
	        	});
	      	} else {
	      		jobPending = jobArray;
	      		if(instance && instance_terminated[instance.InstanceId] == false) {
		      		spotInstance.getInstanceData(instance.InstanceId, function (instanceErr, instanceData) {
						instance = instanceData;
						if(instanceData.State.Name == 'terminated') {
							spotInstance.cancelRequest(instanceData.SpotInstanceRequestId, function (error, cancel) {
								if(error || !cancel) {
									console.log("Couldn't Cancel Spot Request. Please Try Manually in AWS Console!!");
									sqsMonitor(jobPending, waitTime, callback);
								} else {
									completed[instanceData.InstanceId] = false;
									instance_terminated[instanceData.InstanceId] = true;
									console.log("Spot Instance Terminated in between Job Running. Jobs Finished:", finishedJobs, "\nPending Jobs:", jobPending, "\nStarting Pending Jobs in new spot instance.");
									setTimeout(function () {	
										startJobs(jobPending, resultPath, function (sig) {
											if(sig == 'not started') console.log("Jobs Not started due to some error.");
											else console.log("Pending Job finished. Spot Instance Terminated");
										});
										sqsMonitor(jobPending, waitTime, callback);
									}, 10000);
								}
							});
						} else {
							console.log("Waiting for Jobs to Complete.", jobPending);
							if(completed[instanceData.InstanceId]) console.log("Waiting for result to update....");
							sqsMonitor(jobPending, waitTime, callback);
						}
					});
				} else sqsMonitor(jobPending, waitTime, callback);
	      	}
	   	});
	}, waitTime * 60 * 1000);
}

var deleteMessage = function (qURL, Qmessages, callback) {
	var params = {
	  	QueueUrl: qURL
	};
	var Entries = [];
	Qmessages.forEach(function (message) {
		Entries.push(JSON.parse(message));
	});
	params["Entries"] = Entries;
	setTimeout(function () {
		sqs.deleteMessageBatch(params, function(err, data) {
		  	if(err) {
		  		console.log("SQS delete Error: Couldn't delete messages.\nPlease Delete messages mannually in AWS console.");
		  	}
		  	console.log("SQS messages deleted:", data);
		  	callback();
		});
	}, 2000);
}

function execute (jobs, time, callback) {
	var closeMonitor = false;
	var result;
	if(runningJob == false) {
		jobArray = jobs;
		waitTime = time;
		console.log("Jobs:",jobArray, "\nJob Monitor Waiting time:", waitTime, 'minutes');
		console.log("Starting Job...", jobArray);
		runningJob = true;
		startJobs(jobArray, resultPath, function (termSig) {
			if(termSig == 'not started') console.log("Jobs Not started due to some error.");
			else console.log("Jobs finished Spot Instance Terminated.");
		});

		sqsMonitor(jobArray, waitTime, function (finished, res) {
			if(finished == 'finished') console.log("Q Monitoring Stopped after All jobs completed.");
			else console.log("Something went wrong. Q Monitoring Stopped unexpectedly. Please Terminate instance mannually.");
			console.log("go to http://localhost:8081/report/"+res+" to see the result.")
			closeMonitor = true;
			result = res;
		});
	}

	var check = function () {
		if(closeMonitor) {
			closeMonitor = false;
			runningJob = false;
			return callback(result);
		} else setTimeout(function () { check(); }, 5000);
	}
	check();
}

exports.execute = execute;
