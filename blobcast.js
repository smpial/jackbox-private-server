const express = require("express");
const request = require("request");
const utils = require("./utils.js");
const router = express.Router();

router.get('/crossdomain.xml', (req, res) => {
	res.header('application/xml');
	return res.send('<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\n<cross-domain-policy>\n\t<allow-access-from domain="*" to-ports="*" />\n</cross-domain-policy>');
});

router.get("/socket.io/1", (req, res) => {
	res.header('Content-Type: text/plain');
	res.send(utils.make('token')+":60:60:websocket,flashsocket");
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
		if(typeof req.body[element] === 'undefined'){
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
	// it's a temporary placeholder
	res.send({
		success: true,
		artifactId: "00000000000000000000000000000000",
		rootId: "jbg-blobcast-artifacts"
	});
});

router.get("/artifact/gallery/:gameId/:artifactId", (req, res) => {
	res.sendStatus(503);
});

router.get("/artifact/gif/:gameId/:artifactId/:fileId", (req, res) => {
	res.sendStatus(503);
});

router.post("/storage/content", (req, res) => {
	res.sendStatus(503);
});

router.get("/storage/content/:contentId", (req, res) => {
	res.sendStatus(503);
});

router.post("/tts/generate", async (req, res) => {
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
