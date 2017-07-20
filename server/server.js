var express = require('express'),
	app = express(),
	fs = require('fs');

app.get('/result/:id', function (req, res) {
	var result = process.env.HOME + '/workspace/resultsOfSpotPOC/' + req.params.id + "/result.json";
	fs.readFile(result, function(err, data){
		if(err) {
			res.writeHead(404);
			res.write("Page not found");
		}
		else {
			var html = '<html><head><title>Job Result</title></head><body>';
			var success = JSON.parse(data).success.join("").replace(/\n/g, '<br/>');
			var error = JSON.parse(data).error.join("").replace(/\n/g, '<br/>');
			html += '<div><b>Result:</b><br/>' + success + '</div><br/><div><b>Errors:</b><br/>' + error + '<br/></div></body></html>';
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(html);
		}
		res.end();
	});
});

app.listen(8081, function () {
	console.log("Server is running at port:", 8081);
});