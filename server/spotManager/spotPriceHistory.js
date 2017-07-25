var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

var increase = function (spotPrice, increment) {
	var price = spotPrice.split("");
	price[price.length-3] = (parseInt(price[price.length-3]) + increment).toString();
	return (price.join(""));
}

var getBidPrice = function (inputData, callback) {
	console.log("\n=========================================\nGetting Spot Price History...");
	var spotCommand, spotPrice, bidPrice;
	
	var now = new Date();
	var endTime = new Date(now).toISOString();

	spotCommand = 'aws ec2 describe-spot-price-history --availability-zone ' + inputData.Specification.Placement.AvailabilityZone + ' --instance-types ' + inputData.Specification.InstanceType + ' --product-descriptions ' + inputData.Platform + ' --max-items 10 --end-time ' + endTime;

	console.log(spotCommand+'\n=========================================\n');
	exec(spotCommand, {maxBuffer: 200 * 1024 * 1024}, function (error, stdout, stderr) {
		if(!error || stdout) {
			var spotPrices = JSON.parse(stdout)['SpotPriceHistory'];
			console.log("Last 10 Spot Prices:\n", spotPrices);
			spotPrice = spotPrices[0].SpotPrice;
			bidPrice = increase(spotPrice, inputData.Increment);
			return callback(null, spotPrice, bidPrice);
		} else return callback(error, null, null);
	});
}

exports.getBidPrice = getBidPrice;