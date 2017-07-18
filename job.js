var fs     = require('fs');
var AWS    = require('aws-sdk');
var common = require('./utils/common.js');
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
      return callback(err);
      console.log('ERR', err);
    }
    console.log(data);
    callback({'result': true});
  });
}

var s3Upload = function(jobname, callback) {
  var data = {Key: jobname+".jpg", Body: fs.createReadStream(__dirname + '/images/output/' + jobname + 'thumb.jpg')};
  s3Bucket.putObject(data, function(err, data) {
    if(err) {
      return callback(err);
      console.log('ERR', err);
    }

    console.log(data);
    callback({'result': true});
  });
}


var jobConversion = function(){
  var jobs = (input) ? input.split("#") : [];
	console.log(jobs);
  common.each(jobs, function(job, job_callback) {
    var jobname = job;
    exec('convert' + " ./images/" + jobname + '.jpg -resize 50%' + ' ./images/output/' + jobname + 'thumb.jpg', function(err, data) {
      console.log("convert error" + err);
      console.log("convert data" + data);
      sqsUpload(jobname, function(err, result) {
        console.log("sqs error" + JSON.stringify(err));
        console.log("sqs result" + JSON.stringify(result));
        s3Upload(jobname, function(err,result) {
          console.log("s3 error" + JSON.stringify(err));
          console.log("s3 result" + JSON.stringify(result));
          return;
        });
      });
    });
    job_callback();
  }, function(err) {
    return;
  });
}


jobConversion();
