var fs 			 = require('fs');
var common 		 = require('../../utils/common.js');
var utils 		 = require('../scriptAgentUtils/utils.js');
var spotManager  = require('../spotManager/spotInstanceManager.js');
var spotInstance = require('../scriptAgentUtils/spotInstanceUtils');
var jobRunner 	 = require('./jobRunner.js');

var AWS, sqs, s3Bucket;
try {
	AWS = require('aws-sdk');
	utils.getCredential(function (error, accessKey, secretKey, config) {
		if(error) throw error;
		AWS.config.update(config);
		sqs = new AWS.SQS();
		s3Bucket = new AWS.S3( { params: {Bucket: 'tsgpoc'} } );
	});
} catch (error) {
	console.log("ERROR:", error, '\n Please run "npm install aws-sdk" to solve this error.');
}

var finishedJobs = [];
var Qmessages = [];

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
												jobRunner.startJobs(jobPending, resultPath, function (sig) {
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
										utils.getResult(resultPath[0], function (err, result) {
											finishedJobs.forEach(function (job) {
												result[result.length-1].success += '<a href="https://tsgpoc.s3-us-west-2.amazonaws.com/'+job+'.gif">Open this link to download '+job+'.gif</a><br/>';
											});
											fs.writeFile(resultPath[0], JSON.stringify(result), 'utf8', function (err) {
												callback("finished", resultPath[0].split("/")[resultPath[0].split("/").length-2]);
											});
										});
									} else {
										console.log("Couldn't Terminate Spot Instance. Please Try Manually in AWS Console!!");
										utils.getResult(resultPath[0], function (err, result) {
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
										jobRunner.startJobs(jobPending, resultPath, function (sig) {
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

module.exports.sqsMonitor = sqsMonitor;