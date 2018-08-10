var images = [];
var count = 0;

$(document).ready(function() {
	checkStatus();
	$('img').each(function () {
		$(this).prop('selected', false);
	});
	$('#convert').prop('disabled', true);
	$('#report').hide();
	$('#showReport').show();
	$("#progress").hide();
	$('#hideReport').click(function () {
		$('#showReport').show();
		$('#report').hide();
	});
	$("img").click(function () {
		var url = $(this).attr('src');
		var image = (url.split('/')[url.split('/').length-1]).split('.')[0];
		if($(this).prop('selected') == false) {
			$(this).prop('selected', true);
			$(this).css('border-color','blue');
			images.push(image);
			count++;
			console.log("images:", images, "\ncount:", count);
			$("#result").html('<span style="color:green">'+(url.split('/')[url.split('/').length-1])+' checked. Total '+count+' image(s) selected.</span>');
		} else {
			$(this).prop('selected', false);
			$(this).css('border-color','white');
			var i = images.indexOf(image);
			if(i > -1) {
				images.splice(i, 1);
			}
			if(count > 0) count--;
			if(count <= 0) count = 0;
			console.log("images:", images, "\ncount:", count);
			$("#result").html('<span style="color:green">Image '+(url.split('/')[url.split('/').length-1])+' unchecked. Total '+count+' image(s) selected.</span>');
		}
		if(count > 0) $('#convert').prop('disabled', false);
		else $('#convert').prop('disabled', true);
	});
});

var convert = function () {
	$("#progress").show();
	console.log("images:", images, "\ncount:", count);
	if(images.length == 0) $("#result").html('<span style="color:red">Please select images</span>');
	else {
		$('img').each(function () {
			$(this).prop('selected', false);
		});
		$('#convert').prop('disabled', true);
		$.ajax({
		    url: "/convert",
		    type: "POST",
		    cache: false,
		    dataType: "json",
		    data: {"images":images},
		    success: function(data) {
		      	if(data.result) {
		      		$("#result").html('<span style="color:green">Please don\'t reload or refresh the page.</span>');
					checkStatus();
				}	
				if(data.error) $("#result").html('<span style="color:red">'+data.error+'</span>');
			}
	  	});
	}
}

var checkStatus = function() {
	$.ajax({
	    url: "/check",
	    type: "GET",
	    cache: false,
	    dataType: "json",
	    success: function(data) {
	      	if(data.result.length <= 0) {
	      		if(images.length == 0 && count == 0) {
					return;
				} else {
					$("#progress").show();
		      		setTimeout(function () {
		      			checkStatus();
		      		}, 5000);
				}
			} else {
				if(images.length == 0 && count == 0) {
					$("#progress").hide();
					$("#result").html('<span style="color:green">All image(s) converted.</span>');
					$('#showReport').html('<button id="href" onclick="getReport(\''+data.result[0]+'\')">Click here</button>&nbsp;to see previous job report.');
				} else {
					images = [];
					count = 0;
					$("#progress").hide();
					$("#result").html('<span style="color:green">All image(s) converted.</span>');
					$('#showReport').html('<button id="href" onclick="getReport(\''+data.result[0]+'\')">Click here</button>&nbsp;to see full report.');
				}
			}
		}
  	});
}

var getReport = function(result) {
	$.post('/result/'+result, function (res) {
		console.log(res);
		if(res.error) $("#result").html('<span style="color:red">Couldn\'t get report.</span>');
		else {
			var success = error = '';
			res.data.forEach(function (report) {
				success += report.success;
				error += report.error.join("");
			});
			$('#showReport').hide();
			$('#success').html(success.replace(/\n/g, '<br/>'));
			$('#error').html(error.replace(/\n/g, '<br/>'));
			$('#report').show();
		}
	});
}
