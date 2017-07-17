var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

var curDate = function (type) {
	var now = new Date();
	if(type == 'date') {
		var dd = now.getDate();
		var mm = now.getMonth()+1; //January is 0!
		var yyyy = now.getFullYear();
		if(dd<10) {
		    dd='0'+dd;
		}
		if(mm<10) {
			mm='0'+mm;
		}
		return mm+'/'+dd+'/'+yyyy;
	} else if(type == 'hour') {
		return now.getHours();
	} else {
		return now.getMinutes();
	}
}

var increase = function (spotPrice, increment) {
	var price = spotPrice.split("");
	price[price.length-3] = (parseInt(price[price.length-3]) + increment).toString();
	return (price.join(""));
}

var getBidPrice = function (inputData, callback) {
	console.log("InputData:\n", inputData);
	var spotCommand, spotCommandArgs, spotPrice, bidPrice;
	var date = curDate('date');
	var hr = curDate('hour');
	var min = curDate('minute');
	var dateArr = date.split('/');

	var endTime = new Date(parseInt(dateArr[2]), parseInt(dateArr[0])-1, parseInt(dateArr[1]), parseInt(hr), parseInt(min), 0);

	spotCommand = "aws";
	spotCommandArgs = ['ec2', 'describe-spot-price-history', '--availability-zone', inputData.Specification.Placement.AvailabilityZone, '--instance-types', inputData.Specification.InstanceType, '--product-descriptions', inputData.Platform, '--max-items', '10', '--end-time', endTime];

	console.log(spotCommand, spotCommandArgs);
	var spotPriceHistory = spawn(spotCommand, spotCommandArgs);

	spotPriceHistory.stdout.on('data', function (data) {
		var spotPrices = JSON.parse(data.toString())['SpotPriceHistory'];
		console.log("Last 10 Spot Prices:\n", spotPrices);
		spotPrice = spotPrices[0].SpotPrice;
		bidPrice = increase(spotPrice, inputData.Increment);
	});

	spotPriceHistory.stderr.on('data', function (data) {
		callback(data.toString(), null, null);
	});

	spotPriceHistory.on('error', function (error) {
		callback(error, null, null);
	});

	spotPriceHistory.on('close', function (code, signal) {
		callback(null, spotPrice, bidPrice);
	});
}

exports.getBidPrice = getBidPrice;