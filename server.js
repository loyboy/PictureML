var webstack = require('./webstack')
var mongodb = require('mongodb').MongoClient
var proxyPort = 3000
var dbUrl = 'mongodb://localhost:27017'
var dbname = 'myproject'
var multer  = require('multer')
var upload = multer({ dest: '/var/www/html/uploads/' })

var file_system = require('fs');
var archiver = require('archiver');



function randKey() {
	return String(Math.ceil(Math.random() * 100000000)) + String(Math.ceil(Math.random() * 100000000))
}

boot().then(main)

async function boot() {
	return (await mongodb.connect(dbUrl)).db(dbname)
}

async function main(db) {

	var tests = db.collection('tests')
	var samples = db.collection('samples')

	async function createUser (req,res) {
		//if (!req.session.user == "admin") return res.redirect('../createUser.html?error=Permission%Error')
		if (req.body.password != req.body.password2) return res.redirect('../createUser.html?error=MismatchPassword')
		if (await db.collection('users').findOne({user:  req.body.user})) return res.redirect('../createUser.html?error=DuplicateUserError')
		db.collection('users').insertOne( {user : req.body.user , password : req.body.password } )
		res.redirect('/success.html')
	}

	async function login (req,res) {
		if (await db.collection('users').findOne({user : req.body.user, password : req.body.password})) {
			req.session.user = req.body.user
			res.redirect('../select.html')
		} else {
			res.redirect('../login.html?error=invalid%20username%20or%20password')
		}
	}

	async function hello (req,res) {
		if (!req.session.user) return res.redirect('../login.html')
		res.send("hello")
	}

	async function getTests (req,res) {
		//if (!req.session.user) return res.send('please login')
		var testQuery = {};
		if (req.session.user != "admin") testQuery.user = req.session.user
		if (req.query.key != "undefined") testQuery.parent = req.query.key
		var t = await tests.find(testQuery).toArray()
		for (var k in t) {
			var test = t[k]
			test.parent = await samples.findOne({ key : test.parent })
			//console.log(test.parent)
		}
		res.send ( t.map(function(x) { return { name : x.name, parent : x.parent, annotated : x.annotated, time : x.time, key : x.key , logged : x.logged, user : x.user, owner: x.owner} }) )
	}	
	async function getsamples (req,res) {
		//if (!req.session.user) return res.send('please login')
		var slideQuery = {};
		if (req.query.key) slideQuery.key = req.query.key
		console.log(slideQuery)
		//if (req.session.user != "admin") slideQuery.user = req.session.user
		var t = await samples.find(slideQuery).toArray()
		for (var i in t) {
			var test = t[i]
			console.log("test:" , test)
			for (var k in test.rooms) {
				var room = test.rooms[k]
			//	console.log("room:",room)
				var luTest = await tests.findOne({key : room.key })
				//console.log(luTest,test)
				if (luTest) test.rooms[k] = luTest
			}
		}	
		var results =  t.map(function(x) { return { name : x.name, annotated : x.annotated, time : x.time, key : x.key , user : x.user, rooms : x.rooms, owner : x.owner} })
		//console.log(results.map(x=>x.rooms))
		res.send ( results )
	}	
	async function archive( photos,res ){
		console.log(photos[0])
		console.log(photos[0].rooms)
		try { file_system.mkdirSync(`/var/www/html/uploads/${photos[0].name}`,console.log) } catch (err) { } 
		for (var i in photos[0].rooms) {
			var room = photos[0].rooms[i]
			try { file_system.mkdirSync(`/var/www/html/uploads/${photos[0].name}/${room.name}`,console.log) } catch (err) { }
			room = await tests.findOne({key : room.key})
			for (var k in room.photos) {
				var photo = room.photos[k]
				console.log(photo.path, `/var/www/html/uploads/${photos[0].name}/${room.name}/`)
				try { file_system.copyFileSync(photo.path,`/var/www/html/uploads/${photos[0].name}/${room.name}/${photo.path.replace('/var/www/html/uploads/','')}`) } catch (err) { console.log(err) } 
			} 
		}
		var zipFile = `/var/www/html/uploads/${photos[0].name}.zip`
		var output = file_system.createWriteStream(zipFile);
		var archive = archiver('zip');

		output.on('close', function () {
		    console.log(archive.pointer() + ' total bytes');
		    console.log('archiver has been finalized and the output file descriptor has closed.');
		});

		archive.on('error', function(err){
		    throw err;
		});
		archive.on('finish', function(err) {
			res.redirect(zipFile.replace('/var/www/html',''))
		})
		archive.pipe(output);
		archive.directory(`/var/www/html/uploads/${photos[0].name}/`, false)
		archive.finalize();
		return zipFile.replace('/var/www/html','')
	}
	async function getSamplePhotos (req,res) {
		//if (!req.session.user) return res.send('please login')
		var slideQuery = {};
		if (req.query.key) { slideQuery.key = req.query.key } else { res.send("No Key provided"); return false }
		console.log(slideQuery)
		//if (req.session.user != "admin") slideQuery.user = req.session.user
		var t = await samples.find(slideQuery).toArray()
		archive(t,res)
	}	

	async function postTest (req,res) {
		if (!req.session.user) return res.redirect('../login.html')
		console.log(req.body)
		tests.insert({ user : req.session.user, name : req.body.name, time : Date.now().toString(), photos : req.files, annotated : false, key : req.body.key });
		res.send("ok")
	}	
	async function uploadTest (req, res, next) {
		//if (!req.session.user) return res.redirect('../login.html')
		console.log(req.files);
		await tests.update({ key : req.body.key } , { $set : { time : Date.now().toString(), logged : true , photos : req.files,annotated : false } } ) 
		var test = await tests.findOne({ key : req.body.key})		
		res.redirect('../select.html?key=' + String(test.parent))
	}
	async function getTest(req,res) {
		//if (!req.session.user) return res.redirect('../login.html')
		var t = await tests.findOne({key : req.query.key })
		if (!t.count) {
			t.count = []
			for (var c in t.points) {
				var p = t.points[c]
				t.count[p.slide-1] = t.count[p.slide-1] ? t.count[p.slide-1] + 1 : 1
			}
		}	
		console.log(t)
		res.send(t)
	}
	async function getTestPictures(req,res) {
		//if (!req.session.user) return res.redirect('../login.html')
		var t = await tests.findOne({key : req.query.key })
		if (!t.count) {
			t.count = []
			for (var c in t.points) {
				var p = t.points[c]
				t.count[p.slide-1] = t.count[p.slide-1] ? t.count[p.slide-1] + 1 : 1
			}
		}	
		console.log(t)
		res.redirect(t)
	}
	async function postAnnotations (req,res) {
		//if (!req.session.user) return res.redirect('../login.html')
		var keys = Object.keys(req.body)
		console.log(keys)
		var counts = keys.filter(x=>x.match('count')).map(x=>Number(x.replace('count',''))).map(x=>req.body[`count${x}`])
		console.log(counts);
		tests.update({key : req.body.key}, { $set : { points : req.body.points , annotated : true, count : counts } })
		res.send("ok")	
	}
	async function getReport ( req, res ) {
	//	if (!req.session.user) return res.redirect('../login.html')
		var key = req.query.key
		var sample = await samples.findOne({key : key})
		console.log(sample)

			var test = sample
			console.log("test:" , test)
			for (var k in test.rooms) {
				var room = test.rooms[k]

				var luTest = await tests.findOne({key : room.key })
				if (luTest) test.rooms[k] = luTest
			}
			
		var count = sample.rooms.map(x=> Math.ceil(x.count.reduce(function(agg,att) { return Number(agg)+Number(att)} )))
		var names = sample.rooms.map(x=>x.name)
	/*	for (var i in points) {
			var point = points[i]
			count[point.slide] = count[point.slide] ? count[point.slide] + 1 : 1
		}	*/
		var ret = { count , key, name : test.name, time : test.time, names }
		console.log("ret:", ret)
		res.send(ret)
	}

        async function getCSV ( req, res ) {
        //      if (!req.session.user) return res.redirect('../login.html')
                var key = req.query.key
                var sample = await samples.findOne({key : key})
                console.log(sample)

                        var test = sample
                        console.log("test:" , test)
                        for (var k in test.rooms) {
                                var room = test.rooms[k]

                                var luTest = await tests.findOne({key : room.key })
                                if (luTest) test.rooms[k] = luTest
                        }

                var count = sample.rooms.map(x=> Math.ceil(x.count.reduce(function(agg,att) { return Number(agg)+Number(att)} )))
                var names = sample.rooms.map(x=>x.name)
        /*      for (var i in points) {
                        var point = points[i]
                        count[point.slide] = count[point.slide] ? count[point.slide] + 1 : 1
                }       */
                var ret = { count , key, name : test.name, time : test.time, names }
		var csv = ret.count.map( function (e,i) { return [  ret.name, ret.names[i], ret.count[i]  ] }  )
		var str = "Collection,Slide,Count\n"
		for (var i in csv) {
			str = str + csv[i].join(',') + "\n"
		}
                console.log("csv:", str)
		res.writeHead(200, {'Content-Type': 'application/force-download','Content-disposition':'attachment; filename=data.csv'});

		res.end( str );
                //res.send(ret)
        }


	async function users ( req, res ) {
		//if (!req.session.user) return res.redirect('../login.html')
		res.send( (await db.collection('users').find().toArray()).map(x=>x.user))
	}
	async function newTest ( req, res ) {
		//if (!req.session.user) return res.redirect('../login.html')
		console.log(req.body)
		var batchKey = randKey() 
		for (var i in req.body.list) {
			//console.log(req.body.list[i])
			req.body.list[i].key = randKey()
			await tests.insert({ user : req.session.user, name : req.body.list[i].name, time : Date.now().toString(), photos : [], logged : false, annotated : false, key : req.body.list[i].key , parent : batchKey });
		}
		samples.insert( { user : req.session.user, name : req.body.name, time : Date.now().toString(), rooms : req.body.list, annotated : false, key : batchKey , owner : req.body.owner} );
		res.send("ok")
	}
	webstack.get('/users',users);
	webstack.get('/hello', hello)
	webstack.get('/getTests',getTests)
	webstack.get('/getSamples',getsamples)
	webstack.get('/getSamplePhotos',getSamplePhotos)
	webstack.get('/getTest',getTest);
	webstack.post('/postTest',postTest)
	webstack.get('/getReport',getReport);
	webstack.post('/newTest',newTest);
	webstack.post('/postAnnotations',postAnnotations)
	webstack.post('/upload', upload.array('photos', 12), uploadTest)
	webstack.post('/login',login)
	webstack.post('/createUser',createUser)
	webstack.get('/getCSV',getCSV)
	webstack.listen(proxyPort)

}




