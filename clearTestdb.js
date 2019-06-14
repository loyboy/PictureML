var mongodb = require('mongodb').MongoClient
var dbUrl = 'mongodb://localhost:27017'
var dbname = 'myproject'


async function boot() {
	return (await mongodb.connect(dbUrl)).db(dbname)
}

boot().then(function(db) {
	db.collection('tests').remove()
})
