var express = require('express'),
	cauth = require('connect-auth'),
	auth = require('./lib/auth'),
	encode = require('./lib/encoding')
nodester = require('./lib/nodester-api');

var app = module.exports = express.createServer();

process.on('uncaughtException', function(err) {
	console.log('Uncaught error: ' + err.stack);
});

// Configuration
app.configure(function() {
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(cauth(auth.auth())); // connect-auth with my custom auth
	app.use(express.logger()); // enable logger
	app.use(express.bodyParser()); // parse body
	app.use(express.methodOverride()); // ??
	app.use(express.cookieParser()); // cookie parser
	app.use(express.session({
		key: "ns",
		secret: "keyboard cat"
	})); // session store (NOTE cookieParser should be b4 this)
	app.use(app.router); // use the router
});

app.configure('development', function() {
	app.use(express.errorHandler({
		dumpExceptions: true,
		showStack: true
	}));
});

app.configure('production', function() {
	// app.use(express.errorHandler()); 
	app.use(express.errorHandler({
		dumpExceptions: true,
		showStack: true
	}));
});

var static_routing = express.static(__dirname + '/public', {
	maxAge: "6000000"
});

// Checks whether user has logged in
// No data store used, just plain cookie based auth

function checkAuth(req, res, next) {
	req.is_logged = false;
	// if key=>cred is present in session
	// then user is logged in
	// after verification frm nodester
	if (req.session && req.session.cred) {
		// get from session
		console.log('logged in');
		req.user = req.session.cred;
		req.is_logged = true;
	} else {
		console.log('not logged in');
	}
	next();
}

app.get("/static/*", function(req, res, next) {
	req.url = req.params[0];
	static_routing(req, res, next);
});

// Logout
app.get('/logout', checkAuth, function(req, res) {
	// check whether user is logged in ?
	// then log him out
	req.session.destroy(); // destroy cookie session created
	res.redirect("/"); // redirect to home after delete
});

// Login
app.get('/login', checkAuth, function(req, res) {
	// check whether user is logged in ?
	// then log him out
	if(process.env["debug"]){
		console.log(req.query);
		console.log(req.params);
		console.log(req.body);
	}
	
	if (req.is_logged == true) res.redirect("/");
	else res.render('login', {
		title: 'Login | Nodester Admin Panel',
		is_logged: req.is_logged,
		action: req.query.action
	});
});

app.post('/login', checkAuth, function(req, res, next) {
	// check whether user is logged in ?
	// then log him out
	if (req.is_logged == true) {
		res.redirect('/');
	} else {
		// redirect back to login page, if anything is missing
		if (!req.body.user || req.body.user.user == "" && req.body.user.pass == "") {
			res.redirect("/login?action=incomplete");
			return;
		}

		// encode username and password in base64
		req.user = {
			creds: encode.base64(req.body.user.user + ":" + req.body.user.pass),
			user: req.body.user.user
		}

		// authenticate user
		req.authenticate('awesomeauth', function(err, authenticated) {
			if (authenticated) {
				// set session
				console.log('success');
				req.session.cred = req.user; //set session
				res.redirect("/apps");
			} else {
				// don`t set session
				console.log("failed");
				res.redirect("/login?action=failed");
			}
		});
	}
});

// Login
app.get('/register', checkAuth, function(req, res) {
	// check whether user is logged in ?
	// then log him out
	if(process.env["debug"]){
		console.log(req.query);
		console.log(req.params);
		console.log(req.body);
	}
	res.render('register', {
		title: 'Register | Nodester Admin Panel',
		layout : 'bootstrap',
		is_logged: req.is_logged,
		action: req.query.action
	});
 
});



// Forward requests to Nodester API
app.all("/api/*", checkAuth, function(req, res, next) {
	var debug = process.env.NODE_ENV === 'debug';
	var params = "";
	if (debug) {
		console.log('a request of verb ' + req.method);
		console.log('request params ' + req.params);
		if (req.method === 'DELETE') return;
	}
	// based on HTTP verb, get params
	if (req.is_logged === true) {
		if (req.method == "GET") {
			params = req.query;
		} else {
			params = req.body;
		}
		res.header('Content-Type', 'application/json');
		// method, api path, data, credentials, callback
		nodester.request(req.method, req.params[0], params, req.user.creds, function(response) {
			res.send(response);
		});
	} else if (req.method==='POST' && req.params[0] === 'user') {
		params = req.body;
		res.header('Content-Type', 'application/json');
		// method, api path, data, credentials, callback
		nodester.request(req.method, req.params[0], params, null, function(response) {
			res.send(response);
		});
	} else {
		res.send('Please Login', {
			'Content-Type': 'text/plain'
		},
		401);
	}

});

// Routes
// All routes
app.get("*", checkAuth, function(req, res) {
	// give auth name
	if (req.is_logged == false) res.redirect("/login");
	else {
		res.render('index', {
			title: "Nodester Admin Panel",
			is_logged: req.is_logged,
			user: req.user.user
		});
	}
});

// Only listen on $ node app.js
if (!module.parent) {
	app.listen(process.env["port"] ? process.env["port"] : 13032);
	console.log("Express server listening on port %d", app.address().port);
}
