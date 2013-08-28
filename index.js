/**
 * App Server
 * - Providing RESTful Web Services for demostrations.
 * - It support service module and service profile.
 *
 * @author Chieh Yu (welkineins@gmail.com)
 */

var restify = require("restify"),
	mongo   = require("mongoskin"),
	fs      = require("fs"),
	path    = require("path"),
	_		= require("underscore"),
	url     = require("url"),
	os      = require("os");

var host = os.hostname() + ".cs.nctu.edu.tw",
    port = process.argv[2] || 9999,
    noDelay = (process.argv[3] && true) || false,
    module_path = "./public/modules/",
    policy_path = "./public/policies/",
    db_path = "localhost:27017/test?auto_reconnect&w=1";

var db     = mongo.db(db_path),
	server = restify.createServer();

// Secuirty
// ----------------------------------------------------
server.use(function(req, res, next) {
	// Security check                           
	var ips = [
		"140.113.216.105",                      
		"140.113.235.158",
		"140.113.235.157",                      
		"127.0.0.1",
	];                                          

	ips.forEach(function(ip){                   
		if(req.connection.remoteAddress == ip) {
			next();                             
			return false;
		}                                       
	});
});

// -- Parse Body
// --------------------------------------------------------
server.use(restify.bodyParser({mapParams: false}));

// -- Add delay
//-----------------------------------------------------
if( ! noDelay) {
	server.use(function(req, res, next) {
		setTimeout(function() {
			next();
	    }, 200);
	});
}

// -- Mashup Service
// ---------------------------------------------------------
server.get(/^\/mashup\/([a-zA-Z0-9_\.~-]+)|([a-zA-Z0-9_\.~-]+)\?(.*)/, function(req, res, next) {
    db.collection("mashup").findOne({uri: req.params[0]}, function(err, service) {
        if(err) {
            return next(err);
        }

        if(service != null) {
            res.setHeader("Link", '<' + service.service_url + '>; rel="service"; method="' + service.method + '"; type="' + service.type + '"');
            if(service.next) {
                res.setHeader("Link", res.getHeader("Link") + ',<' + service.next + '>; rel="next"');
            }
            if(service.engine) {
                res.setHeader("Link", res.getHeader("Link") + ',<' + service.engine + '>; rel="engine"');
            }
            res.setHeader('Content-Type', 'application/javascript');
            res.writeHeader(200);
            res.write(service.transform.uri);
            res.write(service.transform.request);
            res.write(service.transform.response);
            res.end();
            console.log("[OK] meta service [" + req.params[0] + "] served");
            return next();
        } else {
            console.log("[Error] meta service not found: " + req.params[0]);
            res.send(404);
            return next(false);
        }
    });
});

// -- Module
// --------------------------------------------------------
function moduleHandler(req, res, next) {
	db.collection("services").findOne({uri: "service/" + req.params[0]}, function(err, service) {
		if( ! err) {
			var file = path.join(module_path, service.module_file);
			fs.stat(file, function(err, stats) {
				if( ! err) {
					var fstream = fs.createReadStream(file);
					fstream.once("open", function(fd) {
						res.cache({maxAge:60});
						res.set("Content-Length", stats.size);
						res.set("Content-Type", 'application/vnd.service-module; runtime="' + service.module_runtime + '"');
						res.set("Last-Modified", stats.mtime);
						res.writeHead(200);
						fstream.pipe(res);
						fstream.once("end", function () {
							console.log("[OK] module '" + req.url + "' downloaded");
							return next(false);
						});
					});
				} else {
					return next(err);
				}
			});
		} else {
			return next(err);
		}
	});
}

server.get(/^\/service\/([a-zA-Z0-9_\.~-]+)\/module/, moduleHandler);

// -- Policy
// --------------------------------------------------------
function policyHandler(req, res, next) {
	db.collection("services").findOne({uri: "service/" + req.params[0]}, function(err, service) {
		if( ! err) {
			var body = JSON.stringify(service.policy);
			res.cache({maxAge:60});
			res.setHeader("Content-Length", Buffer.byteLength(body));
			res.setHeader("Content-Type", 'application/vnd.service-policy; schema="' + service.policy_schema + '"');
			res.writeHead(200);
			res.write(body);
			res.end();
			console.log("[OK] policy '" + req.url + "' downloaded");
			return next(false);
		} else {
			return next(err);
		}
	});
};

server.get(/^\/service\/([a-zA-Z0-9_\.~-]+)\/policy/, policyHandler);

// -- Service
// --------------------------------------------------------
function serviceHandler(req, res, next) {
	db.collection("services").findOne({uri: ("service/" + req.params[0])}, function(err, service) {
		if(err) {
			 console.log("query failed: " + err);
			return next(err);
		}

		if(service != null) {
			try {
				var module = require(service.name);
				module.init({
					prefix: "/service/" + req.params[0],
					runtime: "server",
				});
			} catch(e) {
				return next(e);
			}
			
			res.setHeader("Link", '<http://' + host + ((port != 80) ? ':'+ port : '') + '/' + service.uri + '/module>; rel="module"; type="application/vnd.service-module"; runtime="' + service.module_runtime + '",'
				                + '<http://' + host + ((port != 80) ? ':'+ port : '') + '/' + service.uri + '/policy>; rel="policy"; type="application/vnd.service-policy+json"; schema="' + service.policy_schema + '"');
			var _req = _.clone(req);
			var query = url.parse(req.url);
			_req.url = query.path;
			res.setHeader("X-Count", "0");
			module.route(_req, res, next);
			console.log("[OK] Service '" + req.url + "' served");
		} else {
			console.log("[Error] Service not found: service/" + req.params[0]);
			res.send(404);
			return next(false);
		}
	});
}

server.get(/^\/service\/([a-zA-Z0-9_\.~-]+)\/(.*)/, serviceHandler);
server.head(/^\/service\/([a-zA-Z0-9_\.~-]+)\/(.*)/, serviceHandler);
server.post(/^\/service\/([a-zA-Z0-9_\.~-]+)\/(.*)/, serviceHandler);
server.put(/^\/service\/([a-zA-Z0-9_\.~-]+)\/(.*)/, serviceHandler);
server.del(/^\/service\/([a-zA-Z0-9_\.~-]+)\/(.*)/, serviceHandler);

// -- Utlity Functions
// --------------------------------------------------------

server.get(/^\/utility_function\/([a-zA-Z0-9_\.~-]+)\/([a-zA-Z0-9_\.~-]+)/, function(req, res, next) {
	var key = req.params[0] + '/' + req.params[1];
	db.collection("utility_function").findOne({url: key}, function(err, func) {
		if(err) {
			return next(err);
		} else if(func == null){
			res.send(404); return next(false);
		}

		res.cache({maxAge: 60});
		res.send(200, func.func);
		console.log("[OK] Utility Function [" + key + "] served");
		return next(false);
	});
});

// Start Listening
server.listen(port, function() {
	console.log("App server is running on host: " + host + ", port: " + port);
});

