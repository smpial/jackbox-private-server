const utils = require("./utils.js");
const Room = require("./room.js");
const artifacts = require("./artifacts.js");

const defaultErrors = {
	1000: "ecast server error",
	1001: "create room failed",
	1002: "unable to connect to room",
	1003: "server is shutting down",
	2000: "ecast client error",
	2001: "parse error in ecast protocol",
	2002: "missing opcode",
	2003: "invalid opcode",
	2004: "invalid arguments",
	2005: "entity not found",
	2006: "an entity already exists with that key",
	2007: "the entity is not of the expected type",
	2008: "no such client",
	2009: "room is locked",
	2010: "room is full",
	2011: "no such license",
	2012: "invalid license",
	2013: "room not found",
	2014: "requested role does not exist",
	2015: "twitch login required",
	2016: "no such option",
	2017: "password required",
	2018: "invalid room password",
	2019: "missing name",
	2021: "text did not pass text filters",
	2022: "no such filter",
	2023: "permission denied",
	2024: "not connected to a room",
	2025: "illegal operation",
	2026: "invalid ACL change",
	2027: "room has already ended",
	2028: "the entity is locked",
	2420: "rate limit exceeded",
	9001: "client disposed"
};
const roomExitCauseMap = {
	0: "noExit",
	1: "lobbyTimeout",
	2: "joinTimeout",
	3: "gameTimeout",
	4: "disconnect",
	5: "byRequest",
	6: "shuttingDown"
};

const dontSendOk = [
	'room/get-audience',
	'room/exit',
	'echo',
	'artifact/create',
	'number/get',
	'object/get',
	'object/echo',
	'text/get',
	'text/echo',
	'text-map/get',
	'doodle/get',
	'audience/count-group/get',
	'audience/g-counter/get',
	'audience/pn-counter/get',
	'audience/text-ring/get',
	'external-request/get'
];

module.exports = function(client, request, req){
	client.end = () => {
		client.close(1000);
		//client.terminate();
	};
	client.sendMsg = (msg, re) => {
		let message = {
			pc: client.jbg.room ? global.jbg.rooms[client.jbg.room].pc++ : 0,
			re,
			...msg
		};
		if(client.jbg.room && global.jbg.rooms[client.jbg.room]){
			if(message.isReplay){
				delete message.isReplay;
			}else{
				let playerId = global.jbg.rooms[client.jbg.room].getPlayerByUserId(client.jbg.userId, true);
				global.jbg.rooms[client.jbg.room].messages.push({
					ts: Date.now(),
					incoming: false,
					server: 'ecast',
					from: null,
					to: parseInt(playerId),
					pc: message.pc,
					seq: null,
					msg: message
				});
			}
		}
		console.log(client.id+"< "+utils.toJson(message));
		client.send(utils.toJson(message));
	};
	client.sendError = (re, code, error) => {
		client.sendMsg({
			re,
			opcode: "error",
			result: {
				code: code,
				msg: error || defaultErrors[code]
			}
		});
	};
	client.sendOk = re => {
		client.sendMsg({
			re,
			opcode: "ok",
			result: {}
		});
	};
	client.on('close', () => {
		console.log(client.id+" disconnected");
		if(client.jbg.room && global.jbg.rooms[client.jbg.room]){
			if(client.jbg.isAudience){
				global.jbg.rooms[client.jbg.room].disconnect(client.id);
			}else{
				global.jbg.rooms[client.jbg.room].disconnect(client.jbg.userId);
			}
		}
		delete global.jbg.wsIds[client.id];
	});
	client.on('error', (err) => {
		console.log('-------------------');
		console.log(err);
		console.log('-------------------');
	});
	client.on('message', data => {
		data = data.toString();
		client.seq++;
		console.log(client.id+': '+data);
		if(client.jbg.room && global.jbg.rooms[client.jbg.room] && utils.isJson(data)) global.jbg.rooms[client.jbg.room].messages.push({
			ts: Date.now(),
			incoming: true,
			server: 'ecast',
			from: parseInt(global.jbg.rooms[client.jbg.room].getPlayerByUserId(client.jbg.userId, true)),
			to: null,
			pc: null,
			seq: JSON.parse(data).seq || client.seq,
			msg: JSON.parse(data)
		});
		if(!utils.isJson(data)){
			client.sendError(undefined, 2001);
		}else if(!utils.checkEcastMessage(JSON.parse(data))){
			let message = JSON.parse(data);
			if(!message.opcode){
				client.sendError(undefined, 2002);
			}else if(typeof message.opcode !== 'string' || message.params.constructor !== Object){
				client.sendError(undefined, 2004);
			}else{
				client.sendError(undefined, 2000);
			}
		}else{
			let message = JSON.parse(data);
			if(!opcodes[message.opcode]){
				client.sendError(undefined, 2003);
			}else{
				let type = message.opcode.split('/')[0];
				if(type == 'audience') type = message.opcode.split('/')[0]+'/'+message.opcode.split('/')[1];
				let action = message.opcode.split('/')[message.opcode.split('/').length-1];
				let checkResult = utils.checkEntityParams(type, action, message.params);
				if(!checkResult && checkResult !== null){
					client.sendError(message.seq, 2004);
					return false;
				}else{
					let result = opcodes[message.opcode](client, message);
					if(result){
						if(dontSendOk.indexOf(message.opcode) === -1) client.sendOk(message.seq);
					}else{
						//client.end();
					}
				}
			}
		}
	});
	client.id = utils.randomId(1000000, 9999999);
	client.seq = 0;
	while(global.jbg.wsIds[client.id]) client.id = utils.randomId(1000000, 9999999);
	client.jbg = {
		room: null,
		userId: null,
		isHost: false,
		isPlayer: false,
		isModerator: false,
		isAudience: false,
		server: 'ecast',
		ping: null
	};
	global.jbg.wsIds[client.id] = client;
	let room = req.url.split('/')[4];
	let success = true;
	let reconnect = false;
	if(!global.jbg.rooms[room]){
		client.sendError(undefined, 2013);
		success = false;
	}else if(
		global.jbg.rooms[room].getPlayerByUserId(req.query['user-id'], true) &&
		global.jbg.rooms[room].getPlayerByUserId(req.query['user-id'], false).connected
	){
		client.sendError(undefined, 2000);
		success = false;
	}else if(
		global.jbg.rooms[room].getPlayerByUserId(req.query['user-id'], true) &&
		!global.jbg.rooms[room].getPlayerByUserId(req.query['user-id'], false).connected
	){
		reconnect = true;
	}
	if(success){
		client.jbg.room = room;
		client.jbg.userId = req.query['user-id'] || utils.randomId(1000000, 9999999).toString();
		let twitchLoggedIn = false;
		if(req.query['twitch-token']){
			let userData = utils.checkTwitchToken(req.query['twitch-token']);
			if(!userData.error){
				twitchLoggedIn = true;
				req.query.name = userData.data[0].display_name;
			}
		}
		if(req.query.role == 'host'){
			if(req.query['host-token'] != global.jbg.rooms[room].token){
				success = false;
			}else if(global.jbg.rooms[room].host.connected){
				client.sendError(undefined, 2023);
				success = false;
			}else{
				let joined = global.jbg.rooms[room].connect(client.id, req.query['user-id'], "", 'host', 'ecast', req.query['replay-since']);
				if(joined) client.jbg.isHost = true;
				else{
					client.sendError(undefined, 1002);
					success = false;
				}
			}
		}else if(req.query.role == 'player'){
			if(global.jbg.rooms[room].isTwitchLocked() && !twitchLoggedIn){
				client.sendError(undefined, 2015);
				success = false;
			}else if(global.jbg.rooms[room].isPasswordRequired() && !req.query.password){
				client.sendError(undefined, 2017);
				success = false;
			}else if(
				global.jbg.rooms[room].isPasswordRequired() &&
				req.query.password != global.jbg.rooms[room].config.password
			){
				client.sendError(undefined, 2018);
				success = false;
			}else if(!req.query.name){
				client.sendError(undefined, 2019);
				success = false;
			}else if(global.jbg.rooms[room].isUserBanned(client.jbg.userId)){
				client.sendError(undefined, 2023, "session has been banned from this game: permission denied");
				success = false;
			}else if(global.jbg.rooms[room].isLocked() && !reconnect){
				client.sendError(undefined, 2009);
				success = false;
			}else if(global.jbg.rooms[room].isFull() && !reconnect){
				client.sendError(undefined, 2010);
				success = false;				
			}else{
				let joined = global.jbg.rooms[room].connect(client.id, client.jbg.userId, req.query.name, 'player', 'ecast', req.query['replay-since']);
				if(joined) client.jbg.isPlayer = true;
				else{
					client.sendError(undefined, 1002);
					success = false;
				}
			}
		}else if(req.query.role == 'moderator'){
			if(!global.jbg.rooms[room].isModerationEnabled()){
				client.sendError(undefined, 2023);
				success = false;
			}else if(!req.query.password){
				client.sendError(undefined, 2017);
				success = false;
			}else if(req.query.password != global.jbg.rooms[room].config.moderatorPassword){
				client.sendError(undefined, 2018);
				success = false;
			}else if(!req.query.name){
				client.sendError(undefined, 2019);
				success = false;
			}else if(global.jbg.rooms[room].isUserBanned(client.jbg.userId)){
				client.sendError(undefined, 2023, "session has been banned from this game: permission denied");
				success = false;
				// but i don't think that moderator can be banned...
			}else{
				let joined = global.jbg.rooms[room].connect(client.id, client.jbg.userId, req.query.name, 'moderator', 'ecast', req.query['replay-since']);
				if(joined) client.jbg.isModerator = true;
				else{
					client.sendError(undefined, 1002);
					success = false;
				}
			}
		}else if(req.query.role == 'audience'){
			if(!global.jbg.rooms[room].isAudienceEnabled()){
				client.sendError(undefined, 2023);
				success = false;
			}else{
				let joined = global.jbg.rooms[room].connect(client.id, client.jbg.userId, req.query.name, 'audience', 'ecast', req.query['replay-since']);
				if(joined) client.jbg.isAudience = true;
				else{
					client.sendError(undefined, 1002);
					success = false;
				}
			}
		}else if(req.query.role == 'shard' || req.query.role == 'harold' || req.query.role == 'observer'){
			client.sendError(undefined, 2025);
			success = false;
		}else{
			client.sendError(undefined, 2014);
			success = false;
		}
	}
	/*if(!success){
		setTimeout(()=>{
			client.end()
		}, 2000);
	}*/
}

function actionEntity(c, msg){
	if(!c.jbg.room){
		c.sendError(msg.seq, 2024);
		return false;
	}
	let type = msg.opcode.split('/')[0];
	if(type == 'audience') type = msg.opcode.split('/')[0]+'/'+msg.opcode.split('/')[1];
	let action = msg.opcode.split('/')[msg.opcode.split('/').length-1];
	let player = global.jbg.rooms[c.jbg.room].getPlayerByUserId(c.jbg.userId, false);
	if(!player && c.jbg.userId == global.jbg.rooms[c.jbg.room].host.userId) player = global.jbg.rooms[c.jbg.room].host;
	if(!player && global.jbg.rooms[c.jbg.room].isAudience(c.id)) player = {
		role: 'audience',
		profileId: c.id
	};
	/*let key = null;
	if(type == 'audience/count-group' || type == 'audience/text-ring'){
		key = msg.params.name;
	}else{
		key = msg.params.key;
	}*/
	let key = msg.params.key || msg.params.name || null;
	let entity = global.jbg.rooms[c.jbg.room].entities[key];
	if(action == 'create' && msg.opcode.split('/')[0] == 'audience' && entity){
		global.jbg.rooms[c.jbg.room].drop(key);
		entity = global.jbg.rooms[c.jbg.room].entities[key];
	}
	if(action == 'create' || action == 'set'){
		if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}else if(entity && action == "create"){
			c.sendError(msg.seq, 2006);
			return false;
		}
		if(!msg.params.acl){
			if(type.startsWith('audience/')) msg.params.acl = ['r role:audience'];
			else msg.params.acl = msg.params['0'] ? [msg.params['0']] : ['r *'];
		}
	}else{
		if(!entity){
			c.sendError(msg.seq, 2005, "no known entity with key "+key);
			return false;
		}else if(utils.isEntityLockedForPlayer(entity.acl, player.role, player.profileId) && player.role != 'host'){
			if(!(type.startsWith('audience/') && action != 'create' && player.role == 'audience')){
				c.sendError(msg.seq, 2028);
				return false;
			}
		}else if(!utils.isEntityForPlayer(entity.acl, player.role, player.profileId) && player.role != 'host'){
			if(!(type.startsWith('audience/') && action != 'create' && player.role == 'audience')){
				c.sendError(msg.seq, 2025);
				return false;
			}
		}
	}
	if(!utils.checkEntityParams(type, action, msg.params)){
		c.sendError(msg.seq, 2004);
		return false;
	}else if(type == 'doodle' && action == 'stroke'){
		let doodle = global.jbg.rooms[c.jbg.room].get(key);
		let pointsCount = 0;
		doodle.val.lines.forEach(line => {
			pointsCount += line.points.length;
		});
		let error = null;
		if(doodle.val.colors !== null && doodle.val.colors.indexOf(msg.params.color) === -1)
			error = "invalid line color: "+msg.params.color;
		if(doodle.val.weights !== null && doodle.val.weights.indexOf(msg.params.weight) === -1)
			error = "invalid line weight: "+msg.params.weight;
		if(doodle.val.maxPoints > 0 && pointsCount + msg.params.points.length > doodle.val.maxPoints)
			error = "number of points provided ("+msg.params.points.length+") plus current number of points ("+pointsCount+") is greater than maximum allowed ("+doodle.val.maxPoints+")";
		if(doodle.val.maxLayer > 0 && msg.params.layer > doodle.val.maxLayer)
			error = "line layer provided ("+msg.params.layer+") is greater than maximum allowed ("+doodle.val.maxLayer+")";
		msg.params.points.forEach(point => {
			if(point.x < 0 || point.x > doodle.val.size.width || point.y < 0 || point.y > doodle.val.size.height)
				error = "at least one point falls outside the bounds of the doodle ({Height:"+doodle.val.size.height+" Width:"+doodle.val.size.width+"})";
		});
		if(error){
			c.sendError(msg.seq, 2004, error);
			return false;
		}
	}else if(type == 'doodle' && action == 'undo'){
		let doodle = global.jbg.rooms[c.jbg.room].get(key);
		if(doodle.val.lines.length < 1){
			c.sendError(msg.seq, 2004, "no lines present in doodle, cannot undo");
			return false;
		}
	}else if(type == 'text'){
		let accept = {};
		let textEntity = global.jbg.rooms[c.jbg.room].get(key);
		if(textEntity) accept = global.jbg.rooms[c.jbg.room].accept;
		else accept = msg.params.accept;
		if(accept){
			if(accept.length){
				if(accept.length.min !== undefined && msg.params.val < accept.length.min){
					c.sendError(msg.seq, 2021, "text failed an acceptance condition: text is more than "+accept.length.max+" characters long: text did not pass text filters");
					return false;
				}
				if(accept.length.max !== undefined && msg.params.val > accept.length.max){
					c.sendError(msg.seq, 2021, "text failed an acceptance condition: text is less than "+accept.length.min+" characters long: text did not pass text filters");
					return false;
				}
			}
		}
	}
	let params = utils.getEntityParams(type, action, msg.params);
	let success;
	if(action == 'create'){
		success = global.jbg.rooms[c.jbg.room].create(type, key, msg.params.acl, params);
	}else if(action == "set"){
		success = global.jbg.rooms[c.jbg.room].set(type, key, msg.params.acl, params);
	}else if(action == "update"){
		success = global.jbg.rooms[c.jbg.room].update(key, params, player.profileId);
	}else if(action == "increment"){
		success = global.jbg.rooms[c.jbg.room].increment(key, params);
	}else if(action == "decrement"){
		success = global.jbg.rooms[c.jbg.room].decrement(key);
	}else if(action == "sync"){
		success = global.jbg.rooms[c.jbg.room].sync(key, params, player.profileId);
	}else if(action == "stroke"){
		success = global.jbg.rooms[c.jbg.room].stroke(key, params, player.profileId);
	}else if(action == "undo"){
		success = global.jbg.rooms[c.jbg.room].undo(key, player.profileId);
	}else if(action == "push"){
		success = global.jbg.rooms[c.jbg.room].push(key, params);
	}else if(action == "bulkpush"){
		success = global.jbg.rooms[c.jbg.room].bulkpush(key, params);
	}else if(action == "peek"){
		success = global.jbg.rooms[c.jbg.room].peek(key, params);
	}else if(action == "pop"){
		success = global.jbg.rooms[c.jbg.room].pop(key);
	}else{
		c.sendError(msg.seq, 1000);
		return false;
	}
	if(!((type == 'doodle' || type == 'stack' || type.startsWith('audience/')) && action != 'create'))
		global.jbg.rooms[c.jbg.room].notifyEntity(key, !c.jbg.isHost, [player.profileId]);
	return success;
}

function echoEntity(c, msg){
	if(!c.jbg.room){
		c.sendError(msg.seq, 2024);
		return false;
	}else if(!c.jbg.isHost){
		c.sendError(msg.seq, 2023);
		return false;
	}
	let entity = global.jbg.rooms[c.jbg.room].entities[msg.params.key];
	if(!entity){
		c.sendError(msg.seq, 2005, "no known entity with key "+msg.params.key);
		return false;
	}
	let message = {
		opcode: msg.opcode,
		result: {
			message: msg.params.message || ""
		}
	};
	c.sendMsg({
		re: msg.seq,
		...message
	});
	global.jbg.rooms[c.jbg.room].sendByAcl(global.jbg.rooms[c.jbg.room].entities[msg.params.key].acl, message);
	return true;
}

function getEntity(c, msg){
	if(!c.jbg.room){
		c.sendError(msg.seq, 2024);
		return false;
	}
	let type = msg.opcode.split('/')[0];
	if(type == 'audience') type = msg.opcode.split('/')[0]+'/'+msg.opcode.split('/')[1];
	let player = global.jbg.rooms[c.jbg.room].getPlayerByUserId(c.jbg.userId, false);
	if(!player && c.jbg.userId == global.jbg.rooms[c.jbg.room].host.userId) player = global.jbg.rooms[c.jbg.room].host;
	/*let key = null;
	if(msg.opcode == 'audience/text-ring/get'){
		key = msg.params.name;
	}else{
		key = msg.params.key;
	}*/
	let key = msg.params.key || msg.params.name || null;
	let entity = global.jbg.rooms[c.jbg.room].entities[key];
	if(!entity){
		c.sendError(msg.seq, 2005, "no known entity with key "+key);
		return false;
	}else if(
		(!utils.isEntityForPlayer(entity.acl, player.role, player.profileId) ||
		!utils.isEntityReadableForPlayer(entity.acl, player.role, player.profileId)) &&
		player.role != 'host'
	){
		c.sendError(msg.seq, 2023);
		return false;
	}
	c.sendMsg({
		re: msg.seq,
		opcode: type == 'text-map' ? 'text-map/state' : type,
		result: global.jbg.rooms[c.jbg.room].get(key, type == 'text-map' ? msg.params.includeNodes : undefined)
	});
	return true;
}

const opcodes = {
	'room/lock': (c, msg) => {
		if(!c.jbg.room || !c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		global.jbg.rooms[c.jbg.room].lockRoom();
		return true;
	},
	'room/start-audience': (c, msg) => {
		if(!c.jbg.room || !c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		global.jbg.rooms[c.jbg.room].startAudience();
		return true;
	},
	'room/get-audience': (c, msg) => {
		if(!c.jbg.room){
			client.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		c.sendMsg({
			re: msg.seq,
			opcode: 'room/get-audience',
			result: {
				connections: global.jbg.rooms[c.jbg.room].getAudienceCount()
			}
		});
		return true;
	},
	'room/exit': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		global.jbg.rooms[c.jbg.room].closeExpected = true;
		//c.sendOk(msg.seq);
		c.sendMsg({
			re: msg.seq,
			opcode: 'room/exit',
			result: {
				cause: 5
			}
		});
		c.end();
		return true;
	},
	'client/send': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}
		let room = global.jbg.rooms[c.jbg.room];
		if(
			(
				msg.params.from != room.getPlayerByUserId(c.jbg.userId, true) &&
				(!room.host.userId || room.host.userId != c.jbg.userId)
			) || (
				(!room.host.profileId || msg.params.to != room.host.profileId) &&
				room.getPlayerByUserId(c.jbg.userId, false).role != 'host'
			)
		){
			c.sendError(msg.seq, 2023);
			return false;
		}
		let success = room.send(msg.params.from, msg.params.to, msg.params.body);
		if(!success){
			if(!room.clients[msg.params.from] && !room.host.profileId != msg.params.from){
				c.sendError(msg.seq, 2008, "there is no connected client having id "+data.params.from);
			}else if(!room.clients[msg.params.to] && !room.host.profileId != msg.params.to){
				c.sendError(msg.seq, 2008, "there is no connected client having id "+data.params.to);
			}else{
				c.sendError(msg.seq, 2000);
			}
			return false;
		}
		return true;
	},
	'client/kick': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost && !c.jbg.isModerator){
			c.sendError(msg.seq, 2023);
			return false;
		}
		let room = global.jbg.rooms[c.jbg.room];
		if(msg.params.id == room.host.profileId){
			c.sendError(msg.seq, 2023);
			return false;
		}
		let success = room.kick(msg.params.id, msg.params.reason, msg.params.ban);
		if(!success){
			if(!room.clients[msg.params.from] && !room.host.profileId != msg.params.from){
				c.sendError(msg.seq, 2008, "there is no connected client having id "+msg.params.from);
			}else if(!room.clients[msg.params.to] && !room.host.profileId != msg.params.to){
				c.sendError(msg.seq, 2008, "there is no connected client having id "+msg.params.to);
			}else{
				c.sendError(msg.seq, 2000);
			}
			return false;
		}
		return true;
	},
	'drop': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}else if(!msg.params.key){
			c.sendError(msg.seq, 2004);
			return false;
		}
		if(!global.jbg.rooms[c.jbg.room].entities[msg.params.key]){
			c.sendError(msg.seq, 2005, "no known entity with key "+msg.params.key);
			return false;
		}
		let acl = global.jbg.rooms[c.jbg.room].entities[msg.params.key].acl;
		global.jbg.rooms[c.jbg.room].drop(msg.params.key);
		global.jbg.rooms[c.jbg.room].sendByAcl(acl, {
			opcode: "drop",
			result: {
				key: msg.params.key
			}
		});
		return true;
	},
	'echo': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}else if(!msg.params.message){
			c.sendError(msg.seq, 2004);
			return false;
		}
		let room = global.jbg.rooms[c.jbg.room];
		room.sendToAll({
			opcode: 'echo',
			result: {
				message: msg.params.message
			}
		});
		return true;
	},
	'lock': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!msg.params.key){
			c.sendError(msg.seq, 2004);
			return false;
		}
		let room = global.jbg.rooms[c.jbg.room];
		let player = room.getPlayerByUserId(c.jbg.userId, false);
		if(!room.entities[msg.params.key]){
			c.sendError(msg.seq, 2005, "no known entity with key "+msg.params.key);
			return false;
		}else if(!utils.isEntityForPlayer(room.entities[msg.params.key].acl, player.role, player.profileId)){
			c.sendError(msg.seq, 2025);
			return false;
		}else if(utils.isEntityLocked(room.entities[msg.params.key].acl)){
			c.sendError(msg.seq, 2028);
			return false;
		}
		global.jbg.rooms[c.jbg.room].lock(msg.params.key);
		global.jbg.rooms[c.jbg.room].sendByAcl(room.entities[msg.params.key].acl, {
			opcode: 'lock',
			result: {
				key: msg.params.key,
				from: global.jbg.rooms[c.jbg.room].host.profileId
			}
		});
		return true;
	},
	'artifact/create': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!msg.params.blob || !msg.params.appId || !msg.params.categoryId){
			c.sendError(msg.seq, 2004);
			return false;
		}
		if(!msg.params.key) msg.params.key = "";
		let artifactId = artifacts.create(msg.params.categoryId, {
			appId: msg.params.appId,
			categoryId: msg.params.categoryId,
			blob: msg.params.blob,
			isProfane: false,
			isTextFlagged: false
		});
		let resp = {
			opcode: "artifact",
			result: {
				artifactId,
				categoryId: msg.params.categoryId,
				rootId: "jbg-blobcast-artifacts",
				key: msg.params.key,
				isProfane: false,
				isTextFlagged: false
			}
		};
		c.sendMsg(resp, msg.seq);
		global.jbg.rooms[c.jbg.room].sendByAcl([{to:'all'}], resp, false);
		return true;
	},
	'number/create': actionEntity,
	'number/decrement': actionEntity,
	'number/get': getEntity,
	'number/increment': actionEntity,
	'number/update': actionEntity,
	'object/create': actionEntity,
	'object/echo': echoEntity,
	'object/get': getEntity,
	'object/set': actionEntity,
	'object/update': actionEntity,
	'text/echo': echoEntity,
	'text/get': getEntity,
	'text/create': actionEntity,
	'text/set': actionEntity,
	'text/update': actionEntity,
	'text/filter': (c, msg) => true,
	'text-map/create': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		if(global.jbg.rooms[c.jbg.room].config.appTag != 'risky-text'){
			c.sendError(msg.seq, 2023, "hmmm... your game doesn't need this entity: permission denied");
			return false;
		}
		return actionEntity(c, msg);
	},
	'text-map/sync': actionEntity,
	'text-map/get': getEntity,
	'doodle/create': actionEntity,
	'doodle/get': getEntity,
	'doodle/stroke': actionEntity,
	'doodle/undo': actionEntity,
	// stack is still unfinished even on official servers and is not used anywhere
	'stack/create': (c, msg) => false,
	'stack/push': (c, msg) => false,
	'stack/bulkpush': (c, msg) => false,
	'stack/peek': (c, msg) => false,
	'stack/pop': (c, msg) => false,
	'audience/count-group/create': actionEntity,
	'audience/count-group/increment': actionEntity,
	'audience/count-group/get': getEntity,
	'audience/g-counter/create': actionEntity,
	'audience/g-counter/increment': actionEntity,
	'audience/g-counter/get': getEntity,
	'audience/pn-counter/create': actionEntity,
	'audience/pn-counter/increment': actionEntity,
	'audience/pn-counter/decrement': actionEntity,
	'audience/pn-counter/get': getEntity,
	'audience/text-ring/create': actionEntity,
	'audience/text-ring/get': getEntity,
	'audience/text-ring/push': actionEntity,
	'game/started': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		return true;
	},
	'game/metric': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		return true;
	},
	'game/ended': (c, msg) => {
		if(!c.jbg.room){
			c.sendError(msg.seq, 2024);
			return false;
		}else if(!c.jbg.isHost){
			c.sendError(msg.seq, 2023);
			return false;
		}
		return true;
	},
	'external-request/create': actionEntity,
	'external-request/get': getEntity
};
