var fs     = require('fs');
var AWS    = require('aws-sdk');
var common = require('../../utils/common.js');
var exec   = require('child_process').exec;

var accessKey = process.env.accessKey;
var secretKey = process.env.secretKey;
var region = process.env.region;
var input = process.env.job;

var qURL = "https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc";

AWS.config.update({accessKeyId: accessKey, secretAccessKey: secretKey, region:region});
var sqs = new AWS.SQS({region:region});
var s3 = new AWS.S3();
var s3Bucket = new AWS.S3( { params: {Bucket: 'tsgpoc'} } );

var sqsUpload = function(jobname, callback) {
  var msg = { jobname: jobname };
  var sqsParams = {
		MessageBody: JSON.stringify(msg),
		QueueUrl: qURL
  };

  sqs.sendMessage(sqsParams, function(err, data) {
		if (err) {
			console.log("\n["+new Date(Date.now())+"] SQS sending error: "+JSON.stringify(err));
		  return callback(err);
		}
		console.log("\n["+new Date(Date.now())+"] SQS sent data: "+JSON.stringify(data));
		callback(null, {'result': true});
  });
}

var s3Upload = function(jobname, callback) {
  var data = { Key: jobname + ".gif",
  	Body: fs.createReadStream(__dirname + '/../images/output/' + jobname + '.gif'),
  	ACL: 'public-read'
  };
  s3Bucket.putObject(data, function(err, data) {
		if(err) {
			console.log("\n["+new Date(Date.now())+"] S3 uploading error: "+JSON.stringify(err));
		  return callback(err);
		}
		console.log("\n["+new Date(Date.now())+"] S3 uploaded data: "+JSON.stringify(data));
		callback(null, {'result': true});
  });
}

var jobConversion = function () {
    var jobs = (input) ? input.split("#") : [];
    console.log("\n["+new Date(Date.now())+"] Jobs to do: "+jobs);
    common.each(jobs, function(job, job_callback) {
		var jobname = job;
		console.log("\n["+new Date(Date.now())+"] Starting Job: " + job);
		setTimeout(function () {
			var command = 'mogrify -format gif -path ./output/ -thumbnail 200x200 ' + jobname + '.jpg';
			exec(command, { cwd: __dirname + '/../images/' }, function (error, stdout, stderr) {
			    if(error || stderr) {
			  		console.log("\n["+new Date(Date.now())+"] Job not done: "+jobname+"\n["+new Date(Date.now())+"] Error:"+(error || stderr));
			  		return job_callback();;
			  	}
			  	console.log("\n["+new Date(Date.now())+"] Job Done: "+jobname+"\n["+new Date(Date.now())+"] Success: "+stdout);
			  	console.log("\n["+new Date(Date.now())+"] Updating SQS....");
			  	sqsUpload(jobname, function(sqserr, result) {
					if(!sqserr || result.result == true) {
						console.log("\n["+new Date(Date.now())+"] Updated Job "+jobname+" in SQS.");
						console.log("\n["+new Date(Date.now())+"] Uploading Result to S3....");
						s3Upload(jobname, function(s3err,result) {
							if(!s3err || result.result == true) {
								console.log("\n["+new Date(Date.now())+"] Uploaded Result of Job "+jobname+" to S3.");
					  			return job_callback();
						  	} else {
						  		console.log("\n["+new Date(Date.now())+"] Couldn't Upload Result of Job "+jobname+" to S3.");
						  		return job_callback();
						  	}
						});
					} else {
						console.log("\n["+new Date(Date.now())+"] Couldn't Update Job "+jobname+" in SQS.");
						return job_callback();
					}
			  	});
			});
		}, 60*1000);
  	}, function(err) {
		console.log("\n["+new Date(Date.now())+"] Completed All Jobs "+jobs);
  	});
}

console.log("\n["+new Date(Date.now())+"] Got docker container and Running Jobs ", ((input) ? input.split("#") : []));
jobConversion();
