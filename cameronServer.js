var webstack = require('./webstack')
var mongodb = require('mongodb').MongoClient
var proxyPort = 3000
var dbUrl = 'mongodb://localhost:27017'
var dbname = 'myproject'
var multer  = require('multer')
var upload = multer({ dest: '/var/www/html/uploads/' })
function randKey() {
	return String(Math.ceil(Math.random() * 100000000)) + String(Math.ceil(Math.random() * 100000000))
}

boot().then(main)

async function boot() {
	return (await mongodb.connect(dbUrl)).db(dbname)
}

async function main(db) {

	var tests = db.collection('tests')
	var testQuery = {};

	async function hello (req,res) {
		res.send("hello")
	}
	async function getTests (req,res) {
		var t = await tests.find(testQuery).toArray()
		res.send ( t.map(function(x) { return { name : x.name, annotated : x.annotated, time : x.time, key : x.key } }) )
	}		

	async function postTest (req,res) {
		console.log(req.body)
		res.send("ok")
	}	
	async function uploadTest (req, res, next) {
		console.log(req.files);
		tests.insert({ name : req.body.name, time : Date.now().toString(), photos : req.files, annotated : false, key : randKey() });
		res.redirect('../select.html')
	}
	async function getTest(req,res) {
		var t = await tests.findOne({key : req.query.key })	
		console.log(t)
		res.send(t)
	}
	async function postAnnotations (req,res) {
		console.log(req.body)
		tests.update({key : req.body.key}, { $set : { points : req.body.points , annotated : true } })
		res.send("ok")	
	}
	async function getReport ( req, res ) {
		var key = req.query.key
		var test = await tests.findOne({key : key})
		var points = test.points
		var count = {}
		for (var i in points) {
			var point = points[i]
			count[point.slide] = count[point.slide] ? count[point.slide] + 1 : 1
		}	
		res.send({ count , key, name : test.name, time : test.time });
	}
	webstack.get('/hello', hello)
	webstack.get('/getTests',getTests)
	webstack.get('/getTest',getTest);
	webstack.post('/postTest',postTest)
	webstack.get('/getReport',getReport);
	webstack.post('/postAnnotations',postAnnotations)
	webstack.post('/upload', upload.array('photos', 12), uploadTest)
	webstack.listen(proxyPort)

}




