var jobRunner 	 = require('./jobRunner.js');
var QManager 	 = require('./queueManager.js');

var jobArray;
var waitTime;
var runningJob = false;

var execute = function (jobs, time, callback) {
	var closeMonitor = false;
	var result;
	if(runningJob == false) {
		jobArray = jobs;
		waitTime = time;
		console.log("Jobs:",jobArray, "\nJob Monitor Waiting time:", waitTime, 'minutes');
		console.log("Starting Job...", jobArray);
		runningJob = true;

		jobRunner.startJobs(jobArray, resultPath, function (termSig) {
			if(termSig == 'not started') console.log("Jobs Not started due to some error.");
			else console.log("Jobs finished Spot Instance Terminated.");
		});

		QManager.sqsMonitor(jobArray, waitTime, function (finished, res) {
			if(finished == 'finished') {
				console.log("Q Monitoring Stopped after All jobs completed.");
				console.log("go to http://localhost:8081/report/"+res+" to see the result.");
			} else console.log("Something went wrong. Q Monitoring Stopped unexpectedly. Please Terminate instance mannually.");
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
