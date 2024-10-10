const express = require("express");
const utils = require("./utils.js");
const Room = require("./room.js");
const fs = require('fs');
const router = express.Router();

router.get("/api/v2/app-configs/:appTag", (req, res) => {
	if(!global.jbg.appConfigs[req.params.appTag]) return res.status(404).send({
		ok: false,
		error: "Not Found"
	});
	res.send({
		ok: true,
		body: {
			appTag: req.params.appTag,
			appVersion: 0,
			platform: "win",
			settings: global.jbg.appConfigs[req.params.appTag]
		}
	});
});

router.post("/api/v2/rooms", (req, res) => {
	let params = Object.keys(req.body).length ? req.body : req.query;
	if(!params.userId) return res.status(400).send({
		ok: false,
		error: "invalid parameters: missing required field userId"
	});
	if(!params.appTag) return res.status(400).send({
		ok: false,
		error: "invalid parameters: missing required field appTag"
	});
	if(!global.jbg.games.appTags[params.appTag]) return res.status(400).send({
		ok: false,
		error: "the provided appTag \""+params.appTag+"\" is not a known app tag"
	});
	if(params.forceRoomId){
		if(!params.licenseId){
			return res.status(400).send({
				ok: false,
				error: "create room failed: create room failed license check: missing license ID"
			});
		}else if(global.jbg.licenses.indexOf(params.licenseId) === -1){
			return res.status(400).send({
				ok: false,
				error: "create room failed: create room failed license check: missing nonce"
			});
		}
	}
	let room = new Room(params);
	if(room.roomExists) return res.status(500).send({
		ok: false,
		error: "unable to reserve a room: already exists"
	});
	global.jbg.rooms[room.roomId] = room;
	return res.send({
		ok: true,
		body: {
			host: global.jbg.serverUrl,
			code: room.roomId,
			token: room.token
		}
	});
});

router.get("/api/v2/rooms/:roomId", (req, res) => {
	let room = global.jbg.rooms[req.params.roomId];
	if(!room) return res.status(404).send({
		ok: false,
		error: "no such room"
	});
	res.send({
		ok: true,
		body: {
			appId: room.getApp().id,
			appTag: room.getApp().tag,
			audienceEnabled: room.isAudienceEnabled(),
			code: room.roomId,
			host: global.jbg.serverUrl,
			audienceHost: global.jbg.serverUrl,
			locked: room.isLocked(),
			full: room.isFull(),
			maxPlayers: room.config.maxPlayers,
			minPlayers: room.config.minPlayers,
			moderationEnabled: room.isModerationEnabled(),
			passwordRequired: room.isPasswordRequired(),
			twitchLocked: room.isTwitchLocked(),
			locale: room.config.locale,
			keepalive: room.keepalive,
			controllerBranch: ""
		}
	});
});

router.get("/api/v2/rooms/:roomId/play", (req, res) => {
	res.header('Content-Type', 'text/plain');
	res.status(400).send('Bad Request\n{\n  "ok": false,\n  "error": "websocket: the client is not using the websocket protocol: \'upgrade\' token not found in \'Connection\' header"\n}');
});

router.get("/api/v2/audience/:roomId/play", (req, res) => {
	res.header('Content-Type', 'text/plain');
	res.status(400).send({
		ok: false,
		error: "missing Sec-WebSocket-Protocol header"
	});
});

router.post("/api/v2/controller/state", (req, res) => {
	res.sendStatus(200);
});

/*
json example:
location: storage/list/q3featured.json
content:
[
	{
		"contentId": "ABCDEFG",
		"author": "Jackbox Games",
		"title": "Cool episode",
		"type": "",
		"published": "2024-12-31T00:00:00Z"
	},
	...
]

for quiplash 3: storage/list/q3featured.json
for drawful animate: storage/list/drawful-animate.json
for quiplash 3 from tjsp: storage/list/quiplash3-tjsp.json
*/
router.get("/api/v2/ugc/list/:listId", (req, res) => {
	if(fs.existsSync('./storage/list/'+req.params.listId+'.json')) res.send({
		ok: true,
		body: {
			listId: req.params.listId,
			entries: JSON.parse(fs.readFileSync('./storage/list/'+req.params.listId+'.json'))
		}
	});
	else res.status(404).send({
		ok: false,
		error: "not found"
	});
});

module.exports = router;
