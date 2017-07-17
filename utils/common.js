var _  = require('./underscore');
var exec = require('child_process').exec;

var each = function(collection, fn, finalCallback) {
  var keys = _.isArray(collection) ? _.range(collection.length) : _.keys(collection);
  var errs = [];

  var i = 0;
  var doOne = function()
  {
    if (keys.length > 0 && i < keys.length) {
      var item = collection[keys[i]];
      fn(item, function(err) {
        errs.push(err);
        if (err && err.step === 'break') {return doFinal();}

        i++;
        return doOne();
      }, keys[i], collection);
    }
    else {
      return doFinal();
    }
  };
}

var downloadFiles = function(downloadURL, filepath, callback) {
  var curlCommandLine = "curl '" + downloadURL + "' > " + filepath;
  console.log(curlCommandLine);
  exec(curlCommandLine, function(err, stdout, stderr) {
    if (err) {return callback(err);}
    return callback(null, filepath);
  });
}

var uploadFiles = function(fileName, fileType, filePath, uploadURL, callback) {
  var curlCommandLine = "curl -F 'key=" + fileName + "' -F 'Content-Type=" + fileType + "' -F 'file=@" + filePath + "' " +  uploadURL;
  console.log(curlCommandLine);
  exec(curlCommandLine, function(err, stdout, stderr) {
    if (err) {return callback(err);}
    return callback(null, "File successfully uploaded");
  });
}

exports.each = each;
exports.downloadFiles = downloadFiles;
exports.uploadFiles = uploadFiles;