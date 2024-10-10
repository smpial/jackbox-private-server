const http = require('http');
const https = require('https');
const express = require('express');
const fs = require('fs');
const ws = require('ws');
const AWS = require('aws-sdk');
const utils = require('./lib/utils.js');
const blobcastHttp = require('./lib/blobcast.js');
const ecastHttp = require('./lib/ecast.js');
const blobcastWsHandler = require('./lib/blobcast-ws.js');
const ecastWsHandler = require('./lib/ecast-ws.js');
const externalRequest = require('./lib/external-request.js');
const debug = require('./lib/debug.js');

const app = express();
const config = JSON.parse(fs.readFileSync('./config.json'));
global.jbg = {
	rooms: {},
	wsIds: {},
	serverUrl: config.serverUrl,
	externalRequests: {},
	polly: config.polly.enabled ? new AWS.Polly({
		region: 'us-east-1',
		accessKeyId: config.polly.accessKeyId,
		secretAccessKey: config.polly.secretAccessKey
	}) : null,
	pollyUploadUrl: config.polly.uploadUrl,
	artifacts: config.artifacts,
	appConfigs: config.appConfigs,
	games: JSON.parse(fs.readFileSync('./games.json')),
	internalToken: config.internalToken,
	licenses: config.licenses
}
const sslCerts = {cert: fs.readFileSync(config.ssl.cert), key: fs.readFileSync(config.ssl.key)};

const blobcastWsServer = new ws.Server({ noServer: true });
const ecastWsServer = new ws.Server({ noServer: true });
const allowedOrigins = config.allowedOrigins;

blobcastWsServer.on('connection', blobcastWsHandler);
ecastWsServer.on('connection', ecastWsHandler);

function upgradeWs(request, socket, head){
	var req = utils.parseUrl(request.url);
	console.log(req);
	if(req.url.startsWith('/socket.io/1/websocket/')){
		var token = req.url.split('/')[4];
		if(req.url == '/socket.io/1/websocket/'+token){
			blobcastWsServer.handleUpgrade(request, socket, head, socket => {
				blobcastWsServer.emit('connection', socket, request, req);
			});
		}else{
			socket.destroy();
		}
	}else if(req.url.startsWith('/api/v2/rooms/') || req.url.startsWith('/api/v2/audience/')){
		var room = req.url.match(/[A-Z]/g);
		if(!room || room.length < 4){
			socket.destroy();
		}else{
			room = room[0]+room[1]+room[2]+room[3];
			if(req.url == '/api/v2/rooms/'+room+'/play' || req.url == '/api/v2/audience/'+room+'/play'){
				if(utils.checkQuery(req.query)){
					ecastWsServer.handleUpgrade(request, socket, head, socket => {
						ecastWsServer.emit('connection', socket, request, req);
					});
				}else{
					socket.destroy();
				}
			}else{
				socket.destroy();
			}
		}
	}else{
		socket.destroy();
	}
};

app.use(express.json());

app.use((req, res, next) => {
	console.log(req.method, req.originalUrl);
	//console.log(req.headers);
	//if(req.body) console.log(req.body);
	if(req.body) console.log(JSON.stringify(req.body));
	let origin = allowedOrigins.indexOf(req.headers.origin)!==-1?req.headers.origin:(allowedOrigins[0]||null);
	if(origin) res.header('Access-Control-Allow-Origin', origin);
	res.header('Access-Control-Allow-Credentials', 'true');
	if(req.originalUrl.startsWith('/external-request') && req.headers['x-internal-token'] == global.jbg.internalToken) return externalRequest.router(req, res, next);
	if(req.originalUrl.startsWith('/debug') && req.query.token == global.jbg.internalToken) return debug.router(req, res, next);
	if(req.originalUrl.startsWith('/api/v2/')) return ecastHttp(req, res, next);
	return blobcastHttp(req, res, next);
});

const blobcastServer = https.createServer(sslCerts, app);
const ecastServer = https.createServer(sslCerts, app);
const blobcastServerNoSsl = http.createServer(app);
const ecastServerNoSsl = http.createServer(app);

blobcastServer.on('upgrade', upgradeWs);
ecastServer.on('upgrade', upgradeWs);
blobcastServerNoSsl.on('upgrade', upgradeWs);
ecastServerNoSsl.on('upgrade', upgradeWs);

// DO NOT CHANGE PORTS!!!
ecastServerNoSsl.listen(80, () => {
	console.log('Server listening at port 80');
});
ecastServer.listen(443, () => {
	console.log('Server listening at port 443');
});
blobcastServerNoSsl.listen(38202, () => {
	console.log('Server listening at port 38202');
});
blobcastServer.listen(38203, () => {
	console.log('Server listening at port 38203');
});
