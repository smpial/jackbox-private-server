const express = require("express");
const request = require("request");
const utils = require("./utils.js");
const artifacts = require("./artifacts.js");
const fs = require('fs');
const router = express.Router();

router.get('/crossdomain.xml', (req, res) => {
	res.header('application/xml');
	return res.send('<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\n<cross-domain-policy>\n\t<allow-access-from domain="*" to-ports="*" />\n</cross-domain-policy>');
});

router.get("/socket.io/1", (req, res) => {
	res.header('Content-Type', 'text/plain');
	let token = utils.make('token');
	res.header('Set-Cookie', 'socket.io.sid='+token+'; Domain=localhost; Max-Age=3600');
	res.header('X-Server-Name', 'vagrant.vm');
	res.send(token+":60:60:websocket,flashsocket");
});

router.get("/room", (req, res) => {
	return res.send({
		create: true,
		server: global.jbg.serverUrl
	});
});

router.get("/room/:roomId", (req, res) => {
	let room = global.jbg.rooms[req.params.roomId];
	if(!room) return res.status(404).send({
		success: false,
		error: "Invalid Room Code"
	});
	let joinAs = 'player';
	if(room.isFull() || room.isLocked()){
		if(room.isUserInRoom(req.query.userId)){
			joinAs = 'player';
		}else if(room.isAudienceEnabled()){
			joinAs = 'audience';
		}else{
			joinAs = 'full';
		}
	}
	res.send({
		roomid: req.params.roomId,
		server: global.jbg.serverUrl,
		apptag: room.getApp().tag,
		appid: room.getApp().id,
		numAudience: room.getAudienceCount(),
		audienceEnabled: room.isAudienceEnabled(),
		joinAs,
		requiresPassword: room.isPasswordRequired()
	});
});

router.post("/accessToken", (req, res) => {
	var missing = [];
	['roomId', 'appId', 'userId'].forEach((element) => {
		if(typeof req.body[element] === 'undefined' || req.body[element] === null){
			missing.push(element);
		}
	});
	if(missing.length > 0) return res.status(400).send({
		//ok: false,
		success: false,
		error: "form body missing one or more required parameters: "+missing.join(', ')
	});
	let room = global.jbg.rooms[req.body.roomId];
	if(!room) return res.status(400).send({
		//ok: false,
		success: false,
		error: "can't create access token for non-existent room"
	});
	console.log(room.host.userId, req.body.userId);
	if(room.host.userId != req.body.userId) return res.status(400).send({
		//ok: false,
		success: false,
		error: "won't serve access token to non room owner"
	});
	return res.send({
		success: true,
		accessToken: room.token
	});
});

router.post("/artifact", (req, res) => {
	if(!req.body.hasOwnProperty("accessToken") || typeof req.body.accessToken !== 'string') return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required argument: accessToken. supply in query params or request body"
	});
	if(req.headers['content-type'] !== 'application/json') return res.status(400).send({
		//ok: false,
		success: false,
		error: "only support Content-Type application/json"
	});
	var missing = [];
	['appId', 'categoryId', 'userId', 'blob'].forEach((element) => {
		if(typeof req.body[element] === 'undefined' || req.body[element] === null){
			missing.push(element);
		}
	});
	if(missing.length > 0) return res.status(400).send({
		//ok: false,
		success: false,
		error: "form body missing one or more required parameters: "+missing.join(', ')
	});
	if(typeof req.body.appId !== 'string' || typeof req.body.categoryId !== 'string' || typeof req.body.userId !== 'string') return res.status(400).send({
		//ok: false,
		success: false,
		error: "json body decode failed"
	});
	let artifactId = artifacts.create(req.body.categoryId, req.body.blob);
	res.send({
		success: true,
		artifactId,
		categoryId: req.body.categoryId,
		rootId: "jbg-blobcast-artifacts"
	});
});

router.get("/artifact/:gameId/:artifactId", (req, res) => {
	let resp = artifacts.get(req.params.gameId, req.params.artifactId);
	if(resp) res.send(resp);
	else res.status(404).send({
		success: false,
		error: "The specified key does not exist."
	});
});

router.get("/artifact/gallery/:gameId/:artifactId", (req, res) => {
	if(artifacts.renders.indexOf(req.params.gameId) === -1) return res.status(400).send({
		success: false,
		err: "No gallery render function available for "+req.params.gameId
	});
	let resp = artifacts.render(req.params.gameId, req.params.artifactId);
	if(resp) res.send(resp);
	else res.status(404).send({
		success: false,
		error: "The specified key does not exist."
	});
});

router.get("/artifact/gif/:gameId/:artifactId/:fileId", (req, res) => {
	res.sendStatus(503); // {"exists":false,"pending":true,"success":true}
});

router.post("/storage/content", (req, res) => {
	let error = {
		//ok: false,
		success: false,
		error: "json body decode failed"
	};
	if(!req.body.hasOwnProperty("appId")) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: appId"
	});
	if(typeof req.body.appId !== 'string') return res.status(400).send(error);
	if(!req.body.hasOwnProperty("categoryId")) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: categoryId"
	});
	if(typeof req.body.categoryId !== 'string') return res.status(400).send(error);
	if(!req.body.hasOwnProperty("userId")) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: userId"
	});
	if(typeof req.body.userId !== 'string') return res.status(400).send(error);
	if(typeof req.body.blob !== 'object' && req.body.blob.toString() !== '[object Object]' && req.body.blob !== null) return res.status(400).send(error);
	if(req.body.hasOwnProperty("metadata") && (typeof req.body.metadata !== 'object' || req.body.metadata.toString() !== '[object Object]') && req.body.metadata !== null) return res.status(400).send(error);
	if(req.body.metadata.hasOwnProperty("author") && typeof req.body.metadata.author !== 'string' && req.body.metadata.author !== null) return res.status(400).send(error);
	if(req.body.metadata.hasOwnProperty("title") && typeof req.body.metadata.title !== 'string' && req.body.metadata.title !== null) return res.status(400).send(error);
	if(req.body.metadata.hasOwnProperty("locale") && typeof req.body.metadata.locale !== 'string' && req.body.metadata.locale !== null) return res.status(400).send(error);
	if(req.body.hasOwnProperty("creator") && (typeof req.body.creator !== 'object' || req.body.creator.toString() !== '[object Object]') && req.body.creator !== null) return res.status(400).send(error);
	if(req.body.creator.hasOwnProperty("platformId") && typeof req.body.creator.platformId !== 'string' && req.body.creator.platformId !== null) return res.status(400).send(error);
	if(req.body.creator.hasOwnProperty("platformUserId") && typeof req.body.creator.platformUserId !== 'string' && req.body.creator.platformUserId !== null) return res.status(400).send(error);
	let contentId = utils.make('contentId');
	while(fs.existsSync('./storage/content/'+contentId+'.json')) contentId = utils.make('contentId');
	fs.writeFileSync('./storage/content/'+contentId+'.json', JSON.stringify({
		appId: req.body.appId,
		blob: req.body.blob,
		categoryId: req.body.categoryId,
		creator: req.body.creator,
		metadata: req.body.metadata,
		userId: req.body.userId,
		createdTime: Date.now(),
		downloads: 0
	}), 'utf8');
	res.send({
		success: true,
		contentId,
		appId: req.body.appId,
		blob: req.body.blob,
		categoryId: req.body.categoryId,
		creator: req.body.creator,
		metadata: req.body.metadata,
		userId: req.body.userId
	});
});

router.get("/storage/content/:contentId", (req, res) => {
	if(fs.existsSync('./storage/content/'+req.params.contentId+'.json')){
		let content = JSON.parse(fs.readFileSync('./storage/content/'+req.params.contentId+'.json', 'utf8'));
		/*if(
			!content.metadata ||
			!content.metadata.hasOwnProperty("author") ||
			!content.metadata.hasOwnProperty("title") ||
			!content.creator ||
			!content.creator.hasOwnProperty("platformId")
		) return res.status(500).send({
			//ok: false,
			success: false,
			error: "Error reading user content",
			error_code: 1000
		});*/
		let resp = {
			success: true,
			contentId: req.params.contentId,
			appId: content.appId,
			categoryId: content.categoryId,
			userId: content.userId,
			metadata: {
				author: content.metadata && content.metadata.hasOwnProperty("author") ? content.metadata.author : "",
				title: content.metadata && content.metadata.hasOwnProperty("title") ? content.metadata.title : "",
				locale: content.metadata && content.metadata.hasOwnProperty("locale") ? content.metadata.locale : undefined,
			},
			blob: content.blob,
			createdTime: content.createdTime,
			downloads: content.downloads,
			creator: {
				platformId: content.creator && content.creator.hasOwnProperty("platformId") ? content.creator.platformId : "",
				platformUserId: content.creator && content.creator.hasOwnProperty("platformUserId") ? content.creator.platformUserId : "",
			}
		};
		content.downloads++;
		fs.writeFileSync('./storage/content/'+req.params.contentId+'.json', JSON.stringify(content), 'utf8');
		res.send(resp);
	}else res.status(404).send({
		//ok: false,
		success: false,
		error: "Invalid User Content ID",
		error_code: 2005
	});
});

router.post("/tts/generate", async (req, res) => {
	if(!global.jbg.polly.enabled) return res.sendStatus(500);
	if(!req.body.text) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: text"
	});
	if(!req.body.engine) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: engine"
	});
	if(req.body.engine != 'polly') return res.status(400).send({
		//ok: false,
		success: false,
		error: "unrecognized engine. valid engines: polly"
	});
	if(!req.body.voice) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: voice"
	});
	if(!req.body.fileFormat) return res.status(400).send({
		//ok: false,
		success: false,
		error: "missing required parameter: fileFormat"
	});
	/*return res.send({
		success: true,
		url: "https://"+global.jbg.serverUrl+"/rap-battle/"+req.body.fileFormat+"s/"+req.body.voice+"/"+encodeURIComponent(Buffer.from(req.body.text).toString('base64'))+"."+req.body.fileFormat
	});*/
	try{
		let pollyResponse = await global.jbg.polly.synthesizeSpeech({
			OutputFormat: req.body.fileFormat,
			Text: "<speak>"+req.body.text+"</speak>",
			TextType: "ssml",
			VoiceId: req.body.voice,
			Engine: "standard",
			SampleRate: "24000"
		}).promise();
		res.setHeader('Content-Type', 'audio/mpeg');
		request({
			method: "POST",
			url: global.jbg.pollyUploadUrl,
			headers: {
				'x-internal-token': global.jbg.internalToken
			},
			formData: {
				file: {
					value: pollyResponse.AudioStream,
					options: {
						filename: "pollyResponse."+req.body.fileFormat
					}
				},
				voice: req.body.voice
			}
		}, (error, response, body) => {
			if(error) return res.status(500).send({
				ok: false,
				error: error.toString()
			});
			if(response.statusCode !== 200) return res.status(500).send({
				ok: false,
				error: 'Unexpected upload status code: '+response.statusCode
			});
			return res.send({
				success: true,
				url: body
			});
		});
	}catch(e){
		return res.status(500).send({
			ok: false,
			error: e.message
		});
	}
});

// custom endpoint
/*router.get("/rap-battle/:fileFormat/:voice/:text", async (req, res) => {
	let text = Buffer.from(decodeURIComponent(req.params.text.split('.')[0]), 'base64').toString();
	try{
		let pollyResponse = await global.jbg.polly.synthesizeSpeech({
			OutputFormat: req.params.fileFormat.substring(0, req.params.fileFormat.length-1),
			Text: "<speak>"+text+"</speak>",
			TextType: "ssml",
			VoiceId: req.params.voice,
			Engine: "standard",
			SampleRate: "24000"
		}).promise();
		res.setHeader('Content-Type', 'audio/mpeg');
    	res.send(pollyResponse.AudioStream);
	}catch(e){
		res.status(500).send({
			ok: false,
			error: e.message
		});
	}
});*/

module.exports = router;
