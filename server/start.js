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

				console.log("\n=========================================\nLaunching Spot Instance.......\nMonitoring Jobs..."+jobArray+"\n=========================================\n");
				
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
		console.log("\n=========================================\nSpot Instance Terminated. Not checking for AWS termination Request.\n=========================================\n");
		callback('Terminated');
	} else {
		if(termSig == "Termination signal") {
			console.log('\n=========================================\n');
			var startTm = new Date().getTime();
			var diff = 0;
			var subcheck = function () {
				var endTm = new Date().getTime();
				diff = ((endTm - startTm)/1000) + (120-diff);
				console.log("Instance will terminate in" + diff + "seconds. Please save your work");
				if(120-diff == 0) {
					console.log('\n=========================================\n');
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
	var timeout = setTimeout(function () {
		console.log("\n=========================================\ninside Qmonitor\n=========================================\n");
	  	var jobFinished = [];
	  	var jobPending = [];
	  	sqs.receiveMessage({
	    	QueueUrl: "https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc",
	    	VisibilityTimeout: 60, // seconds - how long we want a lock on this job
	    	WaitTimeSeconds: 3 // seconds - how long should we wait for a message?
	 	}, function(err, data) {
	      	if(data.Messages) {
	      		console.log("\n=========================================\nreceived a Message", err, data+'\n=========================================\n');
	       		common.each(data.Messages, function(message, job_callback) {
	       			console.log("inside each message");
	          		var jobname = JSON.parse(message.Body).jobname;
	          		var id = message.MessageId;
	          		var handler = message.ReceiptHandle
	          		var Qmessage = JSON.stringify({"Id": id, "ReceiptHandle": handler});
	          		if(!Qmessages.includes(Qmessage)) Qmessages.push(Qmessage);
	          		console.log('\n=========================================\n');
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
	          		console.log('\n=========================================\n');
	          		job_callback();
	        	}, function(err) {
	        		console.log("\n=========================================\nTotal Jobs:", jobArray);
	        		console.log("Pending jobs:", jobPending);
	        		console.log("Finished jobs", finishedJobs+'\n=========================================\n');
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
											clearTimeout(timeout);
											console.log("\n=========================================\nSpot Instance Terminated in between Job Running. Jobs Finished:", finishedJobs, "\nPending Jobs:", jobPending, "\nStarting Pending Jobs in new spot instance..\n=========================================\n");
											startJobs(jobPending, resultPath, function (sig) {
												if(sig == 'not started') console.log("\n=========================================\nJobs Not started due to some error.\n=========================================\n");
												else console.log("\n=========================================\nPending Job finished. Spot Instance Terminated\n=========================================\n");
											});
											sqsMonitor(jobPending, waitTime, callback);
										}
									});
								} else {
									console.log("\n=========================================\nWaiting for Jobs to Complete.", jobPending+'\n=========================================\n');
									if(completed[instanceData.InstanceId]) console.log("\n=========================================\nWaiting for result to upate....\n=========================================\n");
									sqsMonitor(jobPending, waitTime, callback);
								}
							});
						} else sqsMonitor(jobPending, waitTime, callback);
		            } else if(jobFinished.length == jobArray.length) {
		            	if(completed[instance.InstanceId]) {
		            		completed[instance.InstanceId] = false;
			            	//deleteMessage("https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc", Qmessages, function() {
				            	spotInstance.getInstanceData(instance.InstanceId, function (instanceErr, instanceData) {
				            		instance = instanceData;
				            		if(instanceErr || instanceData.State.Name == 'terminated') {
				            			instance_terminated[instanceData.InstanceId] = true;
										console.log("\n=========================================\nSpot Instance Terminated. All Jobs completed.\ncompleted Jobs:", finishedJobs+'\n=========================================\n');
										getResult(resultPath[0], function (err, result) {
											finishedJobs.forEach(function (job) {
												result.success += '<a href="https://tsgpoc.s3-us-west-2.amazonaws.com/'+job+'.gif">Open this link to download '+job+'.gif</a><br/>';
											});
											fs.writeFile(resultPath[0], JSON.stringify(result), 'utf8', function (err) {
												callback("finished", resultPath[0].split("/")[resultPath[0].split("/").length-2]);
											});
										});
									} else {
										console.log("\n=========================================\nAll Jobs completed. Terminating Spot Instance.\ncompleted Jobs:", finishedJobs+'\n=========================================\n');
										spotManager.terminateAndCancel(instance.InstanceId, inputData.RequestType, function (terminated) {
											if(terminated) {
												instance_terminated[instanceData.InstanceId] = true;
												console.log("\n=========================================\nSpot Instance Terminated\n=========================================\n");
												getResult(resultPath[0], function (err, result) {
													finishedJobs.forEach(function (job) {
														result.success += '<a href="https://tsgpoc.s3-us-west-2.amazonaws.com/'+job+'.gif">Open this link to download '+job+'.gif</a><br/>';
													});
													fs.writeFile(resultPath[0], JSON.stringify(result), 'utf8', function (err) {
														callback("finished", resultPath[0].split("/")[resultPath[0].split("/").length-2]);
													});
												});
											} else {
												console.log("Couldn't Terminate Spot Instance. Please Try Manually in AWS Console!!");
												getResult(resultPath[0], function (err, result) {
													finishedJobs.forEach(function (job) {
														result.success += '<a href="https://tsgpoc.s3-us-west-2.amazonaws.com/'+job+'.gif">Open this link to download '+job+'.gif</a><br/>';
													});
													fs.writeFile(resultPath[0], JSON.stringify(result), 'utf8', function (err) {
														callback("Not Finished", resultPath[0].split("/")[resultPath[0].split("/").length-2]);
													});
												});
											}
										});
									}
				            	});
							//});
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
									clearTimeout(timeout);
									console.log("\n=========================================\nSpot Instance Terminated in between Job Running. Jobs Finished:", finishedJobs, "\nPending Jobs:", jobPending, "\nStarting Pending Jobs in new spot instance.\n=========================================\n");
									startJobs(jobPending, resultPath, function (sig) {
										if(sig == 'not started') console.log("\n=========================================\nJobs Not started due to some error.\n=========================================\n");
										else console.log("\n=========================================\nPending Job finished. Spot Instance Terminated\n=========================================\n");
									});
									sqsMonitor(jobPending, waitTime, callback);
								}
							});
						} else {
							console.log("\n=========================================\nWaiting for Jobs to Complete.", jobPending+'\n=========================================\n');
							if(completed[instanceData.InstanceId]) console.log("\n=========================================\nWaiting for result to updtae....\n=========================================\n");
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
		  		console.log("SQS delete Error:", err, err.stack, "\nPlease Delete messages mannually in AWS console.");
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
		console.log("\n=========================================\nJobs:",jobArray, "\nJob Monitor Waiting time:", waitTime, 'minutes\n=========================================\n');
		console.log("Starting Job...", jobArray);
		runningJob = true;
		startJobs(jobArray, resultPath, function (termSig) {
			if(termSig == 'not started') console.log("\n=========================================\nJobs Not started due to some error.\n=========================================\n");
			else console.log("\n=========================================\nJobs finished Spot Instance Terminated.\n=========================================\n");
		});

		sqsMonitor(jobArray, waitTime, function (finished, res) {
			if(finished == 'finished') console.log("\n=========================================\nQ Monitoring Stopped after All jobs completed[instanceData.InstanceId].\n=========================================\n");
			else console.log("\n=========================================\nSomething went wrong. Q Monitoring Stopped unexpectedly. Please Terminate instance mannually.\n=========================================\n");
			console.log("\n=========================================\ngo to http://localhost:8081/report/"+res+" to see the result.\n=========================================\n")
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
