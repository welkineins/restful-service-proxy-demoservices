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
	_		= require("underscore");

var host = "linux8.cs.nctu.edu.tw",
    port = 9999,
    module_path = "./public/modules/",
    policy_path = "./public/policies/",
    db_path = "localhost:27017/test?auto_reconnect&w=1";

var db     = mongo.db(db_path),
	server = restify.createServer();

server.use(restify.bodyParser({mapParams: false}));

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
							console.log("module '" + req.url + "' downloaded");
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
			console.log("policy '" + req.url + "' downloaded");
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
	console.log("new request: " + req.params[0]);
	db.collection("services").findOne({uri: ("service/" + req.params[0])}, function(err, service) {
		if(err) {
			 console.log("query failed: " + err);
			return next(err);
		}

		if(service != null) {
			try {
				var module = require(service.name);
				module.init({});
			} catch(e) {
				return next(e);
			}
			
			res.setHeader("Link", '<http://' + host + ((port != 80) ? ':'+ port : '') + '/' + service.uri + '/module>; rel="module"; type="application/vnd.service-module"; runtime="' + service.module_runtime + '",'
				                + '<http://' + host + ((port != 80) ? ':'+ port : '') + '/' + service.uri + '/policy>; rel="policy"; type="application/vnd.service-policy+json"; schema="' + service.policy_schema + '"');

			var _req = _.clone(req);
			_req.url = "/" + req.params[1];

			if( ! module.route(_req, res)) {
				console.log("service routing failed");
				res.send(404);
				return next(false);
			} else {
				console.log("service '" + req.url + "' served");
				return next(false);
			}
		} else {
			console.log("service not found: service/" + req.params[0]);
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
			console.log("meta service [" + req.params[0] + "] served");
			return next();
		} else {
			console.log("meta service not found: " + req.params[0]);
			res.send(404);
			return next(false);
		}
	});
});

// Start Listening
server.listen(port, function() {
	console.log("App server is running on port: " + port);
});

