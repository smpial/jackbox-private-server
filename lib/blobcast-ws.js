const utils = require("./utils.js");
const Room = require("./room.js");

module.exports = function(client, request, req){
	client.end = () => {
		client.send('0::');
		client.close(1000);
		//client.terminate();
	};
	client.sendMsg = msg => {
		if(Object.keys(msg).length == 0) return null;
		let message = {
			name: "msg",
			args: [msg]
		}
		console.log(client.id+"< 5:::"+utils.toJson(message));
		client.send('5:::'+utils.toJson(message));
		if(client.jbg.room && global.jbg.rooms[client.jbg.room]){
			global.jbg.rooms[client.jbg.room].pc++;
			global.jbg.rooms[client.jbg.room].messages.push({
				ts: Date.now(),
				incoming: false,
				server: 'blobcast',
				from: null,
				to: parseInt(global.jbg.rooms[client.jbg.room].getPlayerByUserId(client.jbg.userId, true)),
				pc: global.jbg.rooms[client.jbg.room].pc,
				seq: null,
				msg: message
			});
		}
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
		clearInterval(client.jbg.ping);
		delete global.jbg.wsIds[client.id];
	});
	client.on('error', (err) => {
		console.log('-------------------');
		console.log(err);
		console.log('-------------------');
	});
	client.on('message', data => {
		data = data.toString();
		console.log(client.id+': '+data);
		let seq = client.seq++;
		let parts = data.split(':');
		if(parts.length < 3) return client.send('-1::');
		if(parts[0] == "0"){
			if(client.jbg.room && global.jbg.rooms[client.jbg.room] && client.isHost)
				global.jbg.rooms[client.jbg.room].closeExpected = true;
			client.end();
		}else if(parts[0] == "2"){
			// ping
		}else if(parts[0] == "5"){
			let msg = utils.isJson(data.split('5:::')[1]) ? JSON.parse(data.split('5:::')[1]) : null;
			if(!msg || !utils.checkBlobcastMessage(msg)) return client.send('-1::');
			if(client.jbg.room && global.jbg.rooms[client.jbg.room]) global.jbg.rooms[client.jbg.room].messages.push({
				ts: Date.now(),
				incoming: true,
				server: 'blobcast',
				from: parseInt(global.jbg.rooms[client.jbg.room].getPlayerByUserId(client.jbg.userId, true)),
				to: null,
				pc: null,
				seq: client.seq,
				msg
			});
			if(msg.args.constructor == Array){
				msg.args.forEach(arg => {
					let action = arg.action || null;
					if(actions[action]){
						let successful = actions[action](client, arg);
						if(!successful){
							client.send('-1::');
							client.end();
						}
					}
				});
			}else{
				let action = msg.args.action || null;
				if(actions[action]){
					let successful = actions[action](client, msg.args);
					if(!successful){
						client.send('-1::');
						client.end();
					}
				}
			}
		}else{
			return client.send('-1::');
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
		server: 'blobcast',
		ping: setInterval(() => {
			client.send('2:::');
		}, 10000)
	};
	global.jbg.wsIds[client.id] = client;
	client.send('1::');
}

const actions = {
	CreateRoom: (c, msg) => {
		if(c.jbg.isPlayer || c.jbg.isAudience || c.jbg.isHost) return false;
		if(!global.jbg.games.appIds[msg.appId]) return false;
		if(msg.options.forceRoomId){
			if(!msg.options.licenseId){
				c.sendMsg({
					type: "Result",
					action: "CreateRoom",
					success: false,
					roomId: msg.roomId,
					error_code: 1001,
					error: "create room failed: create room failed license check: missing license ID"
				});
				return false;
			}else if(global.jbg.licenses.indexOf(msg.options.licenseId) === -1){
				c.sendMsg({
					type: "Result",
					action: "CreateRoom",
					success: false,
					roomId: msg.roomId,
					error_code: 1001,
					error: "create room failed: create room failed license check: missing nonce"
				});
				return false;
			}
		}
		let room = new Room({
			appTag: global.jbg.games.appIds[msg.appId],
			appId: msg.appId,
			userId: msg.userId,
			forceRoomId: msg.options.forceRoomId || null,
			...msg.options
		}, 'blobcast');
		global.jbg.rooms[room.roomId] = room;
		global.jbg.wsIds[c.id].jbg.room = room.roomId;
		global.jbg.wsIds[c.id].jbg.isHost = true;
		global.jbg.wsIds[c.id].jbg.userId = msg.userId;
		global.jbg.rooms[room.roomId].connect(c.id, msg.userId, "", 'host', 'blobcast');
		global.jbg.rooms[room.roomId].set('object', 'bc:room', ['r *'], {val: {}});
		c.sendMsg({
			type: "Result",
			action: "CreateRoom",
			success: true,
			roomId: room.roomId
		});
		return true;
	},
	StartSession: (c, msg) => {
		if(!c.jbg.isHost || !global.jbg.rooms[c.jbg.room]) return false;
		if(msg.module == 'audience'){
			global.jbg.rooms[c.jbg.room].startAudience();
			c.sendMsg({
				type: "Result",
				action: "StartSession",
				module: "audience",
				name: msg.name,
				success: true,
				response: {
					count: global.jbg.rooms[c.jbg.room].getAudienceCount()
				}
			});
		}else if(msg.module == 'vote'){
			global.jbg.rooms[c.jbg.room].create('audience/count-group', msg.name, ['r role:audience'], {choices: msg.options.choices});
			global.jbg.rooms[c.jbg.room].notifyEntity(msg.name);
			c.sendMsg({
				type: "Result",
				action: "StartSession",
				module: "vote",
				name: msg.name,
				success: true,
				response: {}
			});
		}else if(msg.module == 'comment'){ // options: {"commentsPerPoll":10,"maxComments":1000}
			global.jbg.rooms[c.jbg.room].create('audience/text-ring', msg.name, ['r role:audience'], {
				limit: msg.options.maxComments
			});
			global.jbg.rooms[c.jbg.room].notifyEntity(msg.name);
			c.sendMsg({
				type: "Result",
				action: "StartSession",
				module: "comment",
				name: msg.name,
				success: true,
				response: {}
			});
		}else{
			return false;
		}
		return true;
	},
	GetSessionStatus: (c, msg) => {
		if(!c.jbg.isHost || !global.jbg.rooms[c.jbg.room]) return false;
		if(msg.module == 'audience'){
			c.sendMsg({
				type: "Result",
				action: "GetSessionStatus",
				module: "audience",
				name: msg.name,
				success: true,
				response: {
					count: global.jbg.rooms[c.jbg.room].getAudienceCount()
				}
			});
		}else if(msg.module == 'vote'){
			let entity = global.jbg.rooms[c.jbg.room].get(msg.name);
			if(entity){
				c.sendMsg({
					type: "Result",
					action: "GetSessionStatus",
					module: "vote",
					name: msg.name,
					success: true,
					response: entity.choices
				});
			}else{
				return false;
			}
		}else if(msg.module == 'comment'){
			let entity = global.jbg.rooms[c.jbg.room].get(msg.name);
			if(entity){
				let ts = Date.now();
				let comments = [];
				global.jbg.rooms[c.jbg.room].entities[msg.name].elements.forEach(element => {
					if(comments.length >= global.jbg.rooms[c.jbg.room].entities[msg.name].commentsPerPoll){
						if(global.jbg.rooms[c.jbg.room].entities[msg.name].lastSeenAt < ts)
							global.jbg.rooms[c.jbg.room].entities[msg.name].lastSeenAt = element.ts - 1;
					}else if(element.ts > global.jbg.rooms[c.jbg.room].entities[msg.name].elements.lastSeenAt)
						comments.push(element.value);
				});
				if(global.jbg.rooms[c.jbg.room].entities[msg.name].lastSeenAt < ts)
					global.jbg.rooms[c.jbg.room].entities[msg.name].lastSeenAt = Date.now();
				c.sendMsg({
					type: "Result",
					action: "GetSessionStatus",
					module: "comment",
					name: msg.name,
					success: true,
					response: {
						comments
					}
				});
			}else{
				return false;
			}
		}else{
			return false;
		}
		return true;
	},
	SetRoomBlob: (c, msg) => {
		if(!c.jbg.isHost || !global.jbg.rooms[c.jbg.room]) return false;
		global.jbg.rooms[c.jbg.room].update('bc:room', {val: msg.blob});
		global.jbg.rooms[c.jbg.room].notifyEntity('bc:room');
		c.sendMsg({
			type: "Result",
			action: "SetRoomBlob",
			success: true
		});
		return true;
	},
	SetCustomerBlob: (c, msg) => {
		if(!c.jbg.isHost || !global.jbg.rooms[c.jbg.room]) return false;
		if(!global.jbg.rooms[c.jbg.room].get('bc:customer:'+msg.customerUserId)) return false;
		global.jbg.rooms[c.jbg.room].update('bc:customer:'+msg.customerUserId, {val: msg.blob});
		global.jbg.rooms[c.jbg.room].notifyEntity('bc:customer:'+msg.customerUserId);
		c.sendMsg({
			type: "Result",
			action: "SetCustomerBlob",
			success: true
		});
		return true;
	},
	LockRoom: (c, msg) => {
		if(!c.jbg.isHost || !global.jbg.rooms[c.jbg.room]) return false;
		global.jbg.rooms[c.jbg.room].lockRoom();
		c.sendMsg({
			type: "Result",
			action: "LockRoom",
			success: true,
			roomId: c.jbg.room
		});
		return true;
	},
	StopSession: (c, msg) => {
		if(!c.jbg.isHost || !global.jbg.rooms[c.jbg.room]) return false;
		if(msg.module == 'audience'){
			return false;
		}else if(msg.module == 'vote'){
			let entity = global.jbg.rooms[c.jbg.room].get(msg.name);
			if(entity){
				c.sendMsg({
					type: "Result",
					action: "StopSession",
					module: "vote",
					name: msg.name,
					success: true,
					response: entity.choices
				});
				global.jbg.rooms[c.jbg.room].drop(msg.name);
			}else{
				return false;
			}
		}else if(msg.module == 'comment'){
			let entity = global.jbg.rooms[c.jbg.room].get(msg.name);
			if(entity){
				let comments = [];
				global.jbg.rooms[c.jbg.room].entities[msg.name].elements.forEach(element => {
					if(element.ts > global.jbg.rooms[c.jbg.room].entities[msg.name].elements.lastSeenAt)
						comments.push(element.value);
				});
				global.jbg.rooms[c.jbg.room].entities[msg.name].lastSeenAt = Date.now();
				c.sendMsg({
					type: "Result",
					action: "StopSession",
					module: "comment",
					name: msg.name,
					success: true,
					response: {
						comments
					}
				});
				global.jbg.rooms[c.jbg.room].drop(msg.name);
			}else{
				return false;
			}
		}else{
			return false;
		}
		return true;
	},
	JoinRoom: (c, msg) => {
		if(c.jbg.isPlayer || c.jbg.isAudience || c.jbg.isHost) return false;
		if(!global.jbg.rooms[msg.roomId]) return false;
		global.jbg.wsIds[c.id].jbg.userId = msg.userId;
		if(!msg.joinType) msg.joinType = 'player';
		if(!msg.options) msg.options = {};
		if(msg.joinType == 'player'){
			if(msg.options.twitch){
				let userData = utils.checkTwitchToken(msg.options.twitch);
				if(!userData.error){
					twitchLoggedIn = true;
					msg.name = userData.data[0].display_name;
				}
			}
			if(global.jbg.rooms[msg.roomId].isTwitchLocked() && !twitchLoggedIn){
				c.sendMsg({
					type: "Result",
					action: "JoinRoom",
					success: false,
					initial: false,
					roomId: msg.roomId,
					joinType: "player",
					userId: msg.userId,
					error_code: 2015,
					error: "twitch login required",
					options: {
						roomcode: "",
						name: "",
						email: "",
						phone: ""
					}
				});
				return false;
			}else if(global.jbg.rooms[msg.roomId].isPasswordRequired() && !msg.options.password){
				c.sendMsg({
					type: "Result",
					action: "JoinRoom",
					success: false,
					initial: false,
					roomId: msg.roomId,
					joinType: "player",
					userId: msg.userId,
					error_code: 2017,
					error: "password required",
					options: {
						roomcode: "",
						name: "",
						email: "",
						phone: ""
					}
				});
				return false;
			}else if(global.jbg.rooms[msg.roomId].isPasswordRequired() && msg.options.password != global.jbg.rooms[msg.roomId].config.password){
				c.sendMsg({
					type: "Result",
					action: "JoinRoom",
					success: false,
					initial: false,
					roomId: msg.roomId,
					joinType: "player",
					userId: msg.userId,
					error_code: 2018,
					error: "invalid room password",
					options: {
						roomcode: "",
						name: "",
						email: "",
						phone: ""
					}
				});
				return false;
			}else if(global.jbg.rooms[msg.roomId].isUserBanned(msg.userId)){
				c.sendMsg({
					type: "Result",
					action: "JoinRoom",
					success: false,
					initial: false,
					roomId: msg.roomId,
					joinType: "player",
					userId: msg.userId,
					error_code: 2023,
					error: "session has been banned from this game: permission denied",
					options: {
						roomcode: "",
						name: "",
						email: "",
						phone: ""
					}
				});
				return false;
			}else{
				let joined = global.jbg.rooms[msg.roomId].connect(c.id, msg.userId, msg.name, 'player', 'blobcast');
				if(joined){
					global.jbg.wsIds[c.id].jbg.room = msg.roomId;
					global.jbg.wsIds[c.id].jbg.isPlayer = true;
					let profileId = global.jbg.rooms[msg.roomId].getPlayerByUserId(msg.userId, true);
					if(global.jbg.rooms[msg.roomId].get('bc:room')) global.jbg.rooms[msg.roomId].sendMsg(profileId, {
						opcode: 'object',
						result: global.jbg.rooms[msg.roomId].get('bc:room')
					});
					if(global.jbg.rooms[msg.roomId].get('bc:customer:'+msg.userId)) global.jbg.rooms[msg.roomId].sendMsg(profileId, {
						opcode: 'object',
						result: global.jbg.rooms[msg.roomId].get('bc:customer:'+msg.userId)
					});
				}else{
					return false;
				}
			}
		}else if(msg.joinType == 'audience'){
			let joined = global.jbg.rooms[msg.roomId].connect(c.id, msg.userId, msg.name, 'audience', 'blobcast');
			if(joined){
				global.jbg.wsIds[c.id].jbg.room = msg.roomId;
				global.jbg.wsIds[c.id].jbg.isAudience = true;
				c.sendMsg(utils.getMessage({
					opcode: 'object',
					result: global.jbg.rooms[msg.roomId].get('bc:room')
				}, 'blobcast', msg.roomId, msg.userId))
			}else{
				return false;
			}
		}else{
			return false;
		}
		return true;
	},
	SendMessageToRoomOwner: (c, msg) => {
		if(!c.jbg.isPlayer || !global.jbg.rooms[c.jbg.room]) return false;
		let profileId = global.jbg.rooms[c.jbg.room].getPlayerByUserId(c.jbg.userId, true);
		global.jbg.rooms[c.jbg.room].send(profileId, global.jbg.rooms[c.jbg.room].host.profileId, msg.message);
		return true;
	},
	SendSessionMessage: (c, msg) => {
		if(!c.jbg.isAudience || !global.jbg.rooms[c.jbg.room]) return false;
		if(
			msg.message && msg.module == 'vote' && msg.message.type == 'vote' &&
			global.jbg.rooms[c.jbg.room].get(msg.name) &&
			global.jbg.rooms[c.jbg.room].entities[msg.name].type == 'audience/count-group' &&
			global.jbg.rooms[c.jbg.room].get(msg.name).choices[msg.message.vote] !== undefined
		){
			let voted = global.jbg.rooms[c.jbg.room].increment(msg.name, {
				vote: msg.message.vote,
				times: 1
			});
			if(!voted) return false;
		}else if(
			msg.message && msg.module == 'comment' && msg.message.type == 'comment' &&
			global.jbg.rooms[c.jbg.room].get(msg.name) &&
			global.jbg.rooms[c.jbg.room].entities[msg.name].type == 'audience/text-ring'
		){
			let commented = global.jbg.rooms[c.jbg.room].push(msg.name, {
				text: msg.message.comment
			});
			if(!commented) return false;
		}else{
			return false;
		}
		c.sendMsg({
			type: "Result",
			action: "SendSessionMessage",
			success: true
		});
		return true;
	}
};
