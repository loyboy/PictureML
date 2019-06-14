var express = require('express')
var session = require('express-session')

var app = express()
var bodyParser = require('body-parser')

var app = express();

app.use(bodyParser());
var cors = require('cors');
app.use(cors()); 
app.use(session({ secret: 'this-is-a-secret-token', cookie: { maxAge: 60000000, httpOnly:false }}));
module.exports = app;

