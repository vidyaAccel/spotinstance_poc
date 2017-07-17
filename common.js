var _  = require('./underscore');
var each = function(collection, fn, finalCallback)
{
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

exports.each = each;
