var express 	= require('express'),
	bodyParser 	= require('body-parser'),
	fs 			= require('fs'),
	path 		= require('path'),
	exec 		= require('child_process').exec,
	spawnSync 	= require('child_process').spawnSync;

var app = express();

var start = require('./start.js');
var results = [];

app.use(bodyParser.urlencoded({extended: true}));
app.use('/web', express.static(path.join(__dirname, './web')));
app.use('/images', express.static(path.join(__dirname, './../images')));

app.get('/', function (req, res) {
	fs.readFile('./web/html/index.html', function(err, data){
		if(err) {
			res.writeHead(404);
			res.write("Page not found")
		}
		else {
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(data);
		}
		res.end();
	});
});

app.post('/convert', function (req, res) {
	var jobs = req.body.images;
	start.execute(jobs, 1, function (result) {
		results.push(result);
	});
	res.json({"result":true});
});

app.get('/check', function (req, res) {
	res.json({"result":results});
});

app.post('/result/:id', function (req, res) {
	var result = process.env.HOME + '/workspace/resultsOfSpotPOC/' + req.params.id + "/result.json";
	fs.readFile(result, function(err, data){
		if(err) res.json({"error":err});
		else res.json({"data":JSON.parse(data)});
	});
});

app.get('/report/:id', function (req, res) {
	var result = process.env.HOME + '/workspace/resultsOfSpotPOC/' + req.params.id + "/result.json";
	fs.readFile(result, function(err, data){
		if(err) {
			res.writeHead(404);
			res.write("Page not found");
		}
		else {
			data = JSON.parse(data);
			var html = '<html><head><title>Job Result</title><link rel="stylesheet" href="/web/css/style.css"></head><body>';
			var success = error = '';
			data.forEach(function (report) {
				success += report.success;
				error += report.error.join("");
			});
			html += '<div id="report"><h2>Report:</h2><div id="success">' + success.replace(/\n/g, '<br/>') + '</div><br/><h3>Errors:</h3><div id="error">' + error.replace(/\n/g, '<br/>') + '<br/></div></body></html>';
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(html);
		}
		res.end();
	});
});

app.listen(8081, function () {
	console.log("Server is running at port:", 8081);
});