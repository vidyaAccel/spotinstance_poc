var fs     = require('fs');
var AWS    = require('aws-sdk');
var common = require('./utils/common.js');
var exec   = require('child_process').exec;

var accessKey = process.env.accessKey;
var secretKey = process.env.secretKey;
var region = process.env.region;
var input = process.env.job;

var qURL = "https://sqs.us-west-2.amazonaws.com/399705315545/tsgpoc";

var logFile = __dirname + '/Joblogs/' + input + ".txt";

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
			fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] SQS sending error: "+JSON.stringify(err), 'utf8');
		  return callback(err);
		}
		fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] SQS sent data: "+JSON.stringify(data), 'utf8');
		callback(null, {'result': true});
  });
}

var s3Upload = function(jobname, callback) {
  var data = { Key: jobname+".jpg",
  	Body: fs.createReadStream(__dirname + '/images/output/' + jobname + 'thumb.jpg'),
  	ACL: 'public-read'
  };
  s3Bucket.putObject(data, function(err, data) {
		if(err) {
			fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] S3 uploading error: "+JSON.stringify(err), 'utf8');
		  return callback(err);
		}
		fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] S3 uploaded data: "+JSON.stringify(data), 'utf8');
		callback(null, {'result': true});
  });
}

var logUpload = function(file, callback) {
  var data = { Key: file.split("/")[file.split("/").length-1],
  	Body: fs.createReadStream(file),
  	ACL: 'public-read'
  };
  s3Bucket.putObject(data, function(err, data) {
		if(err) {
			console.log("\n["+new Date(Date.now())+"] Log File uploading error: "+JSON.stringify(err));
		  return callback(err);
		}
		console.log("\n["+new Date(Date.now())+"] Log File uploaded data: "+JSON.stringify(data));
		callback(null, {'result': true});
  });
}


var jobConversion = function () {
  var jobs = (input) ? input.split("#") : [];
	fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Jobs to do: "+jobs, 'utf8');
  common.each(jobs, function(job, job_callback) {
		var jobname = job;
		fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Starting Job: " + job, 'utf8');
		setTimeout(function () {
			exec('convert' + " ./images/" + jobname + '.jpg -resize 50%' + ' ./images/output/' + jobname + 'thumb.jpg', function (error, stdout, stderr) {
			  if(error || stderr) {
			  	fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Job not done: "+jobname+"\n["+new Date(Date.now())+"] Error:"+(error || stderr), 'utf8');
			  	return;
			  }
			  fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Job Done: "+jobname+"\n["+new Date(Date.now())+"] Success: "+stdout, 'utf8');
			  fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Updating SQS....", 'utf8');
			  sqsUpload(jobname, function(sqserr, result) {
					if(!sqserr || result.result == true) {
						fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Updated Job "+jobname+" in SQS.", 'utf8');
						fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Uploading Result to S3....", 'utf8');
						s3Upload(jobname, function(s3err,result) {
							if(!s3err || result.result == true) {
								fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Uploaded Result of Job "+jobname+" to S3.", 'utf8');
					  		return;
					  	} else {
					  		fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Couldn't Upload Result of Job "+jobname+" to S3.", 'utf8');
					  		return;
					  	}
						});
					} else {
						fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Couldn't Update Job "+jobname+" in SQS.", 'utf8');
					  return;
					}
			  });
			});
			job_callback();
		}, 3*60*1000);
  }, function(err) {
  	setTimeout(function () {
	  	fs.appendFileSync(logFile, "\n["+new Date(Date.now())+"] Completed All Jobs "+jobs, 'utf8');
	  	logUpload(logFile, function (err, res) {
	  		exec('rm -rf ' + logFile, function () {
	  			return;
	  		});
	  	});
  	}, 30*1000);
  });
}

jobConversion();
