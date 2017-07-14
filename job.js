var fs = require('fs');
var input = process.argv[2];
var writingString = function(input){
  if(input)
    fs.writeFile('helloworld.txt', input, function (err) {
    if (err) 
    return console.log(err);
    });
}

writingString(input);
