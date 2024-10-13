const utils = require("./utils.js");
const externalRequest = require('./external-request.js');
//const riskyText = require('./raw/risky-text.js');
//const EventEmitter = require('events');
const TextMap = require('./text-map.js');

/*function getTextMapRoot(text){
	let length = 0;
	for(let _ of Buffer.from(text)){
		length++;
		if(length > 255) length = 0;
		// yes, official server doesn't support text maps if size of original text more than 255 bytes
		// some letters and symbols can be more than 1 byte, be careful (for example each russian letter = 2 bytes)
	}
	let res = Buffer.concat([
		Buffer.from('010201000701', 'hex'), // idk what is that
		Buffer.from('07', 'hex'), // length of "default"
		Buffer.from('default'),
		Buffer.from('020401', 'hex'), // idk what is that
		Buffer.from('05', 'hex'), // length of "ecast"
		Buffer.from('ecast'),
		Buffer.from('00', 'hex') // place for text length byte
	]);
	res.writeUint8(length, res.length - 1);
	res = Buffer.concat([
		res,
		Buffer.from(text),
		Buffer.from('00', 'hex')
	]);
	return res.toString('base64');
}

function getTextMapText(document){
	let text = "", attributions = [], r = document._start;
	for (; r !== null;){
		if(!r.deleted && r.countable && r.content.constructor === riskyText.ss){
			text += r.content.str;
			attributions.push({
				author: r.id.client,
				text: r.content.str,
				pc: null
			});
		}
		r = r.right;
	}
	return {text, attributions};
}

function createTextMap(key, text){
	const wsClient = new EventEmitter();
	wsClient.syncTextMap = (a, b)=>{
		//console.log('syncTextMap', a, b);
	};
	let n = new riskyText.K8e({
		responseKey: key,
		wsClient,
		root: getTextMapRoot(text),
		onWrite: (a)=>{
			//console.log('onWrite', a);
		},
		onEcastError: (a)=>{
			//console.log('onEcastError', a);
		}
	});
	n.debugIgnore = true;
	return n;
}*/

class Room {
	constructor(params, server){
		this.config = {
			appTag: params.appTag,
			appId: global.jbg.games.appTags[params.appTag],
			audienceEnabled: params.audienceEnabled || false,
			locale: params.locale || 'en',
			maxPlayers: params.maxPlayers <= global.jbg.games.maxPlayers[params.appTag] ? params.maxPlayers : global.jbg.games.maxPlayers[params.appTag],
			minPlayers: params.minPlayers >= global.jbg.games.minPlayers[params.appTag] ? params.minPlayers : global.jbg.games.minPlayers[params.appTag],
			twitchLocked: params.twitchLocked || false,
			password: params.password || null,
			moderatorPassword: params.moderatorPassword || null
		};
		if(params.maxPlayers && params.maxPlayers <= global.jbg.games.maxPlayers[params.appTag] && params.maxPlayers >= global.jbg.games.minPlayers[params.appTag]){
			this.config.maxPlayers = params.maxPlayers;
		}else{
			this.config.maxPlayers = global.jbg.games.maxPlayers[params.appTag];
		}
		if(params.minPlayers && params.minPlayers <= global.jbg.games.maxPlayers[params.appTag] && params.minPlayers >= global.jbg.games.minPlayers[params.appTag] && params.minPlayers <= this.config.maxPlayers){
			this.config.minPlayers = params.minPlayers;
		}else{
			this.config.minPlayers = global.jbg.games.minPlayers[params.appTag];
		}
		if(this.config.appTag == 'acquisitions-inc') this.roomId = 'AQINC';
		else this.roomId = params.forceRoomId || utils.make('room');
		//while(global.jbg.rooms[this.roomId]) this.roomId = utils.make('room');
		this.roomExists = !!global.jbg.rooms[this.roomId];
		this.token = utils.make('token');
		this.locked = false;
		this.server = (server == 'ecast' || server == 'blobcast') ? server : 'ecast';
		this.host = {
			userId: params.userId,
			wsId: null,
			profileId: null,
			server: this.server,
			name: "",
			connected: false,
			initialized: false,
			role: "host",
			banned: false,
			unreadMessages: []
		};
		this.entities = {};
		this.clients = {};
		this.dummy = {};
		this.audience = {};
		this.banned = [];
		this.pc = 0;
		this.nextProfileId = 1;
		this.keepalive = params.keepalive || false;
		this.destroyTimeout = setTimeout(() => {
			this.destroyRoom();
		}, 300000);
		this.closeExpected = false;
		this.createdAt = Date.now();
		this.messages = [];
	}
	
	getPlayerByUserId(userId, profileIdOnly){
		var result = null;
		if(userId == this.host.userId) result = profileIdOnly ? this.host.profileId : this.host;
		Object.keys(this.clients).forEach(playerId => {
			let player = this.clients[playerId];
			if(player.userId == userId) result = profileIdOnly ? playerId : player;
		});
		if(!result) Object.keys(this.dummy).forEach(playerId => {
			let player = this.dummy[playerId];
			if(player.userId == userId) result = profileIdOnly ? playerId : player;
		});
		return result;
	}
	
	getNextProfileId(){
		return this.nextProfileId++;
	}
	
	destroyRoom(){
		//console.log(this, this.clients);
		Object.keys(this.clients).forEach(playerId => {
			let wsId = this.clients[playerId].wsId;
			if(global.jbg.wsIds[wsId]){
				global.jbg.wsIds[wsId].sendMsg(utils.getMessage({
					opcode:  "room/exit",
					result: {
						cause: 5
					}
				}, this.clients[playerId].server, this.roomId, this.clients[playerId].userId));
				global.jbg.wsIds[wsId].jbg = {
					room: null,
					isHost: false,
					isPlayer: false,
					isAudience: false,
					server: this.clients[playerId].server,
					ping: this.clients[playerId].server == 'blobcast' ? setInterval(() => {
						client.send('2:::');
					}, 10000) : null
				};
				global.jbg.wsIds[wsId].end(); // maybe not necessary
			}
		});
		utils.sendToAudience(this.roomId, {
			opcode:  "room/exit",
			result: {
				cause: 5
			}
		});
		Object.keys(this.audience).forEach(wsId => {
			global.jbg.wsIds[wsId].jbg = {
				room: null,
				isHost: false,
				isPlayer: false,
				isAudience: false,
				server: global.jbg.wsIds[wsId].jbg.server,
				ping: global.jbg.wsIds[wsId].jbg.server == 'blobcast' ? setInterval(() => {
					client.send('2:::');
				}, 10000) : null
			};
		});
		delete global.jbg.rooms[this.roomId];
	}
	
	sendMsg(playerId, msg, userId = ""){
		if(playerId == this.host.profileId){
			let client = utils.getClient(this.host.wsId);
			client ? client.sendMsg(utils.getMessage(msg, this.host.server, this.roomId, userId)) : null;
		}else if(this.clients[playerId]){
			let client = utils.getClient(this.clients[playerId].wsId);
			client ? client.sendMsg(utils.getMessage(msg, this.clients[playerId].server, this.roomId, userId)) : null;
		}
	}
	
	sendMsgByWsId(wsId, msg, server, userId = ""){
		let client = utils.getClient(wsId);
		client ? client.sendMsg(utils.getMessage(msg, server, this.roomId, userId)) : null;
	}
	
	sendToAll(msg){
		this.sendMsg(this.host.profileId, msg);
		Object.keys(this.clients).forEach(playerId => {
			this.sendMsg(playerId, msg);
		});
		utils.sendToAudience(this.roomId, msg);
	}
	
	sendToAllExcept(msg, except){
		this.sendMsg(this.host.profileId, msg);
		Object.keys(this.clients).forEach(playerId => {
			if(except.indexOf(playerId) === -1) this.sendMsg(playerId, msg);
		});
	}
	
	sendByAcl(acl, msg, sendToHost = true){
		if(sendToHost) this.sendMsg(this.host.profileId, msg);
		Object.keys(this.clients).forEach(playerId => {
			if(utils.isEntityForPlayer(acl, this.clients[playerId].role, playerId)) this.sendMsg(playerId, msg);
		});
		if(utils.isEntityForPlayer(acl, 'audience', null)) utils.sendToAudience(this.roomId, msg);
	}
	
	isFull(){
		let playersCount = 0;
		Object.keys(this.clients).forEach(playerId => {
			if(this.clients[playerId].role == 'player') playersCount++;
		})
		return playersCount >= this.config.maxPlayers;
	}
	
	isLocked(){
		return this.locked;
	}
	
	isTwitchLocked(){
		return this.config.twitchLocked;
	}
	
	isUserInRoom(userId){
		let userInRoom = false;
		if(userId == this.host.userId) userInRoom = this.host.connected;
		Object.keys(this.clients).forEach(playerId => {
			let player = this.clients[playerId];
			if(player.userId == userId) userInRoom = true;
		});
		return userInRoom;
	}
	
	isUserInRoomByName(name){
		let userInRoom = false;
		if(name == this.host.name) userInRoom = this.host.connected;
		Object.keys(this.clients).forEach(playerId => {
			let player = this.clients[playerId];
			if(player.name == name) userInRoom = true;
		});
		return userInRoom;
	}
	
	isUserBanned(userId){
		/*let userBanned = false;
		Object.keys(this.clients).forEach(playerId => {
			let player = this.clients[playerId];
			if(player.userId == userId && player.banned) userBanned = true;
		});
		return userBanned;*/
		return this.banned.indexOf(userId) !== -1;
	}
	
	isAudienceEnabled(){
		return (this.config.audienceEnabled && this.get('audience')) ? true : false;
	}

	isAudience(wsId){
		return typeof this.audience[wsId] !== 'undefined';
	}
	
	isPasswordRequired(){
		return !!this.config.password;
	}
	
	isModerationEnabled(){
		return !!this.config.moderatorPassword;
	}

	isPlayerCanJoin(){
		return (this.isFull() || this.isLocked()) ? false : true;
	}
	
	getApp(){
		return {
			tag: this.config.appTag,
			id: this.config.appId
		}
	}
	
	lockRoom(){
		this.locked = true;
	}
	
	getAudienceCount(){
		if(!this.isAudienceEnabled()) return 0;
		return this.entities.audience.count;
	}

	getDummy(){
		return this.dummy;
	}

	isDummyRoleInRoom(role){
		let result = false;
		Object.keys(this.dummy).forEach(playerId => {
			let dummy = this.dummy[playerId];
			if(dummy.role == role) result = true;
		});
		return result;
	}

	getDummyRolePlayerId(role){
		let result = null;
		Object.keys(this.dummy).forEach(playerId => {
			let dummy = this.dummy[playerId];
			if(dummy.role == role) result = parseInt(playerId);
		});
		return result;
	}
	
	startAudience(){
		this.config.audienceEnabled = true;
		this.create('audience/pn-counter', 'audience', ['r *'], {count: this.getAudienceCount()});
		if(this.server == 'blobcast'){
			this.create('object', 'bc:customer:AUDIENCE', ['r role:audience'], {val: {}});
			this.set('object', 'bc:customer:AUDIENCE', ['r role:audience'], {val: {}});
		}
		if(!this.isDummyRoleInRoom('shard')){
			let shardId = this.getNextProfileId();
			this.dummy[shardId] = {
				role: 'shard'
			};
		}
	}
	
	getEntityBody(key, textMapGetText, textMapIncludeNodes){
		let content = {};
		if(this.entities[key].type == 'number'){
			content = {
				val: this.entities[key].val,
				restrictions: this.entities[key].restrictions // increment, type, min, max
			};
		}else if(this.entities[key].type == 'object'){
			content = {
				val: this.entities[key].val
			};
		}else if(this.entities[key].type == 'text'){
			content = {
				val: this.entities[key].val
			};
		}else if(this.entities[key].type == 'text-map'){
			if(textMapGetText){
				//content = getTextMapText(this.entities[key].n.document.getText("ecast"));
				content = this.entities[key].n.getText();
				if(!textMapIncludeNodes) delete content.attributions;
			}else{
				content = {
					//root: getTextMapRoot(this.entities[key].text)
					root: this.entities[key].n.getRoot()
				};
			}
		}else if(this.entities[key].type == 'doodle'){
			content = {
				val: {
					colors: this.entities[key].val.colors,
					lines: this.entities[key].val.lines,
					live: this.entities[key].val.live,
					maxLayer: this.entities[key].val.maxLayer,
					maxPoints: this.entities[key].val.maxPoints,
					size: this.entities[key].val.size,
					weights: this.entities[key].val.weights
				}
			};
		}else if(this.entities[key].type == 'stack'){
			content = {
				size: this.entities[key].vals.length
			};
		}else if(this.entities[key].type == 'audience/count-group'){
			content = {
				choices: this.entities[key].choices
			};
		}else if(this.entities[key].type == 'audience/g-counter'){
			content = {
				count: this.entities[key].count
			};
		}else if(this.entities[key].type == 'audience/pn-counter'){
			content = {
				count: this.entities[key].count
			};
		}else if(this.entities[key].type == 'audience/text-ring'){
			content = {
				elements: this.entities[key].elements
			};
		}else if(this.entities[key].type == 'external-request'){
			content = {
				val: this.entities[key].val
			};
		}
		return {
			key,
			...content,
			version: this.entities[key].version, // version should increment every time when entity is updated
			from: this.entities[key].from
		};
	}
	
	notifyEntity(key, notifyHost = false, except = []){
		//console.log(key, this.entities);
		var msg = {
			opcode: this.entities[key].type,
			result: this.getEntityBody(key)
		};
		if(notifyHost) this.sendMsg(this.host.profileId, msg);
		Object.keys(this.clients).forEach(playerId => {
			//console.log(this.entities[key].acl, this.clients[playerId].role, playerId, utils.isEntityForPlayer(this.entities[key].acl, this.clients[playerId].role, playerId));
			if(
				utils.isEntityForPlayer(this.entities[key].acl, this.clients[playerId].role, playerId) &&
				utils.isEntityReadableForPlayer(this.entities[key].acl, this.clients[playerId].role, playerId) &&
				except.indexOf(playerId) === -1
			) this.sendMsg(playerId, msg);
		});
		if(utils.isEntityForPlayer(this.entities[key].acl, 'audience', null)) utils.sendToAudience(this.roomId, msg);
	}
	
	echo(message){
		this.sendToAll({
			opcode: 'echo',
			result: {
				message
			}
		});
	}
	
	connect(wsId, userId, name, role, server, replaySince){
		server = (server == 'ecast' || server == 'blobcast') ? server : 'ecast';
		if(name.length > 12) name = name.substring(0, 12);
		let reconnect = null;
		if(role != 'host'){
			reconnect = this.isUserInRoom(userId);
		}else{
			reconnect = this.host.initialized && !this.host.connected;
		}
		//if(role == 'host' && this.host.userId && this.host.userId != userId) return false;
		if(role == 'player' && !reconnect && !this.isPlayerCanJoin()) return false;
		if(role == 'audience' && !this.isAudienceEnabled()) return false;
		if(reconnect && this.getPlayerByUserId(userId, false).connected) return false; // duplicate player
		if(reconnect && this.getPlayerByUserId(userId, false).banned) return false;
		let profileId = null;
		if(role == 'host'){
			clearTimeout(this.destroyTimeout);
			this.destroyTimeout = null;
		}
		if(reconnect){
			if(role == 'host'){
				this.host.wsId = wsId;
				this.host.userId = userId;
				this.host.connected = true;
				this.host.server = server;
				profileId = this.host.profileId;
			}else{
				let pid = this.getPlayerByUserId(userId, true);
				this.clients[pid].wsId = wsId;
				this.clients[pid].connected = true;
				this.clients[pid].server = server;
				profileId = this.clients[pid].profileId;
			}
		}else if(role != 'audience'){
			if(!reconnect && this.isUserInRoomByName(name)){
				let nameIndex = 2;
				while(this.isUserInRoomByName(name+nameIndex)) nameIndex++;
				//if(name.length > 12 - nameIndex.toString().length) name = name.substring(0, 12 - nameIndex.toString().length);
				name += nameIndex;
			}
			profileId = this.getNextProfileId();
			if(role == 'host'){
				this.host = {
					wsId,
					name,
					role,
					userId,
					profileId,
					server,
					connected: true,
					initialized: true,
					banned: false,
					unreadMessages: []
				};
			}else{
				this.clients[profileId] = {
					wsId,
					name,
					role,
					userId,
					profileId,
					server,
					connected: true,
					banned: false,
					unreadMessages: []
				};
			}
		}else{
			this.audience[wsId] = null;
			this.increment('audience', {times: 1});
		}
		if(role == 'player' && this.server == 'blobcast' && !reconnect){
			this.set('object', 'bc:customer:'+userId, ['r id:'+profileId], {val: {}});
		}
		let entities = {};
		Object.keys(this.entities).forEach(key => {
			let entity = this.entities[key];
			if(utils.isEntityForPlayer(entity.acl, role, profileId))
				entities[key] = [entity.type, this.getEntityBody(key), {
					locked: utils.isEntityLockedForPlayer(entity.acl, role, profileId)
				}];
		});
		let profile = null;
		let here = null;
		let toHere = {...this.clients, ...this.dummy};
		if(role != 'audience'){
			here = {};
			if(this.host.profileId){
				if(role == 'host'){
					profile = {
						id: profileId,
						roles: {
							host: {}
						}
					};
				}else{
					here[this.host.profileId.toString()] = {
						id: this.host.profileId,
						roles: {
							host: {}
						}
					};
				}
			}
			Object.keys(this.clients).forEach(playerId => {
				let client = this.clients[playerId] || this.dummy[playerId];
				if(playerId != profileId){
					here[playerId.toString()] = {
						id: parseInt(playerId),
						roles: {}
					};
					here[playerId.toString()].roles[client.role] = {};
					if(role == 'player' || role == 'moderator')
						here[playerId.toString()].roles[client.role].name = client.name;
					if(client.kicked) here[playerId.toString()].kicked = {};
					if(client.banned) here[playerId.toString()].banned = {};
				}else{
					profile = {
						id: parseInt(playerId),
						roles: {}
					};
					profile.roles[role] = {};
					if(role == 'player' || role == 'moderator') profile.roles[role].name = name;
				}
			});
		}
		let welcome = {
			opcode: "client/welcome",
			result: {
				id: profileId,
				name,
				secret: role == 'host' ? this.token : userId,
				reconnect,
				deviceId: "",
				entities,
				here,
				profile
			}
		};
		let replayMessages = [];
		if(replaySince){
			this.messages.forEach(msg => {
				if(msg.pc > replaySince && msg.to == profileId) replayMessages.push({
					...msg,
					isReplay: true
				});
			});
			if(replayMessages.length > 0) welcome.result.replayEnd = replayMessages[replayMessages.length-1].pc;
		}
		if(role == 'audience'){
			this.sendMsgByWsId(wsId, welcome, server, userId);
		}else{
			this.sendMsg(profileId, welcome, userId);
		}
		let msg = {
			opcode: "client/connected",
			result: {
				id: profileId,
				userId,
				name,
				role,
				reconnect,
				profile
			}
		};
		let msgToPlayers = {
			opcode: "client/connected",
			result: {
				id: profileId,
				role,
				reconnect,
				profile
			}
		};
		if(role == 'host'){
			Object.keys(this.clients).forEach(playerId => {
				this.sendMsg(playerId, msgToPlayers, userId)
			});
			utils.sendToAudience(this.roomId, msgToPlayers);
		}else{
			this.sendMsg(this.host.profileId, msg, userId);
			if(role != 'host') Object.keys(this.clients).forEach(playerId => {
				if(this.clients[playerId].role == 'moderator') this.sendMsg(playerId, msg, userId)
			});
		}
		if(role != 'audience'){
			let unreadMessages = [];
			if(role == 'host'){
				unreadMessages = this.host.unreadMessages.slice();
				this.host.unreadMessages = [];
			}else{
				unreadMessages = this.clients[profileId].unreadMessages.slice();
				this.clients[profileId].unreadMessages = [];
			}
			unreadMessages.forEach(message => {
				this.send(message.from, message.to, message.body);
			});
		}
		return true;
	}
	
	disconnect(userId, kicked = false, reason = null, banned = false){
		let client = this.getPlayerByUserId(userId, false);
		if(!client && userId == this.host.userId) client = this.host;
		if(!client && this.audience[userId] !== undefined) client = {role: 'audience'};
		if(!client) return false;
		let msg = null;
		let wsId = null;
		if(client){
			wsId = client.wsId + 1 - 1;
			msg = {
				opcode: kicked ? "client/kicked" : "client/disconnected",
				result: {
					id: client.profileId,
					role: client.role
				}
			};
			if(kicked){
				msg.result.reason = reason;
				msg.result.banned = banned;
			}
		}
		if(client.role == 'audience'){
			delete this.audience[userId];
			this.decrement('audience', {times: 1});
		}else if(client.role == 'host'){
			this.host.wsId = null;
			this.host.connected = false;
			Object.keys(this.clients).forEach(playerId => {
				this.sendMsg(playerId, msg, userId)
			});
			utils.sendToAudience(this.roomId, msg);
			if(this.closeExpected){
				this.destroyRoom();
			}else if(this.keepalive){
				this.destroyTimeout = setTimeout(() => {
					this.destroyRoom();
				}, 300000);
			}else{
				this.destroyRoom();
			}
		}else if(client.role == 'player' || client.role == 'moderator'){
			this.sendMsg(this.host.profileId, msg, userId);
			Object.keys(this.clients).forEach(playerId => {
				if(
					this.clients[playerId].role == 'moderator' ||
					(this.clients[playerId].role == 'player' && playerId == client.profileId)
				) this.sendMsg(playerId, msg, userId);
			});
			if(this.clients[client.profileId]){
				this.clients[client.profileId].wsId = null;
				this.clients[client.profileId].connected = false;
			}
		}else{
			return false;
		}
		if(client && global.jbg.wsIds[wsId]) global.jbg.wsIds[wsId].jbg = {
			room: null,
			isHost: false,
			isPlayer: false,
			isAudience: false,
			server: client.server,
			ping: client.server == 'blobcast' ? setInterval(() => {
				client.send('2:::');
			}, 10000) : null
		};
		return true;
	}
	
	send(from, to, body){
		let client = this.clients[to];
		if(!client && to == this.host.profileId) client = this.host;
		if(!this.clients[from] || !client) return false;
		if(!client.connected){
			if(to == this.host.profileId){
				this.host.unreadMessages.push({
					from,
					to,
					body
				});
			}else{
				this.clients[to].unreadMessages.push({
					from,
					to,
					body
				});
			}
		}else{
			this.sendMsg(to, {
				opcode: "client/send",
				result: {
					to,
					from,
					body
				},
				userID: this.clients[from].userId
			}, this.clients[from].userId)
		}
		return true;
	}
	
	kick(playerId, reason, ban = false){
		let client = this.clients[playerId];
		if(!client) return false;
		let kicked = this.disconnect(client.userId, true, reason, ban);
		if(kicked){
			this.dummy[playerId] = {
				profileId: playerId,
				userId: client.userId,
				name: client.name,
				role: client.role,
				kicked: true,
				banned: ban
			};
			delete this.clients[playerId];
			if(ban){
				this.banned.push(client.userId);
			}
		}
		return kicked;
	}
	
	// number, object, text, text-map, doodle, stack, audience/count-group, audience/g-counter,
	// audience/pn-counter, audience/text-ring, external-request
	create(type, key, acl, content){
		if(this.entities[key]) return false;
		this.entities[key] = {
			type,
			key,
			version: 0,
			acl: utils.parseAcl(acl),
			initialized: false,
			from: this.host.profileId
		}
		if(type == 'number'){
			this.entities[key].val = content.val;
			this.entities[key].restrictions = content.restrictions;
		}else if(type == 'object'){
			this.entities[key].val = content.val;
		}else if(type == 'text'){
			this.entities[key].val = content.val;
		}else if(type == 'text-map'){
			this.entities[key].text = content.val;
			//this.entities[key].n = createTextMap(key, content.val);
			this.entities[key].n = new TextMap(content.val, this.host.profileId);
			this.entities[key].notifyHost = content.notifyHost;
		}else if(type == 'doodle'){
			this.entities[key].val = {
				colors: content.colors,
				lines: [],
				live: content.live,
				maxLayer: content.maxLayer,
				maxPoints: content.maxPoints,
				size: content.size,
				weights: content.weights,
				nextLineIndex: 0
			};
		}else if(type == 'stack'){
			this.entities[key].vals = [];
		}else if(type == 'audience/count-group'){
			this.entities[key].choices = {};
			content.choices && content.choices.forEach(choice => {
				if(typeof choice == 'string') this.entities[key].choices[choice] = 0;
			});
			content.options && content.options.forEach(choice => {
				if(typeof choice == 'string') this.entities[key].choices[choice] = 0;
			});
		}else if(type == 'audience/g-counter'){
			this.entities[key].count = content.count;
		}else if(type == 'audience/pn-counter'){
			this.entities[key].count = content.count;
		}else if(type == 'audience/text-ring'){
			this.entities[key].elements = [];
			this.entities[key].limit = content.limit;
			this.entities[key].commentsPerPoll = content.commentsPerPoll;
			this.entities[key].lastSeenAt = 0;
		}else if(type == 'external-request'){
			this.entities[key].val = {
				status: 'pending',
				service: content.service
			};
			externalRequest.create(this.roomId, key, content);
		}else{
			delete this.entities[key];
			return false;
		}
		return true;
	}
	
	// object, text
	set(type, key, acl, content){
		if(!this.entities[key]) this.entities[key] = {
			type,
			key,
			version: 0,
			acl: utils.parseAcl(acl),
			initialized: false,
			from: this.host.profileId
		}
		if(type == 'object'){
			this.entities[key].val = content.val;
		}else if(type == 'text'){
			this.entities[key].val = content.val;
		}else{
			return false;
		}
		this.entities[key].version++;
		return true;
	}
	
	// number, object, text
	update(key, content, playerId = null){
		if(!this.entities[key]) return false;
		if(this.entities[key].type == 'number'){
			this.entities[key].val = content.val;
			this.entities[key].restrictions = content.restrictions;
		}else if(this.entities[key].type == 'object'){
			this.entities[key].val = content.val;
		}else if(this.entities[key].type == 'text'){
			this.entities[key].val = content.val;
		}else{
			return false;
		}
		this.entities[key].version++;
		if(playerId) this.entities[key].from = playerId;
		return true;
	}
	
	// object, text
	echo(key, message){
		if(!this.entities[key]) return null;
		Object.keys(this.clients).forEach(playerId => {
			if(utils.isEntityForPlayer(this.entities[key].acl, this.clients[playerId].role, playerId)) this.sendMsg(playerId, {
				opcode: this.entities[key].type+'/echo',
				result: {
					message
				}
			});
		});
	}
	
	// number, object, text, text-map, doodle, audience/count-group, audience/g-counter,
	// audience/pn-counter, audience/text-ring, external-request
	get(key, textMapIncludeNodes = false){
		if(!this.entities[key]) return null;
		return this.getEntityBody(key, true, textMapIncludeNodes);
	}
	
	// number, audience/count-group, audience/g-counter, audience/pn-counter
	increment(key, content = {}){
		if(!this.entities[key]) return null;
		if(this.entities[key].type == 'number'){
			this.entities[key].val += this.entities[key].restrictions.increment;
			if(
				this.entities[key].restrictions.max !== undefined &&
				this.entities[key].restrictions.max.constructor == Number &&
				this.entities[key].val > this.entities[key].restrictions.max
			) this.entities[key].val = this.entities[key].restrictions.max;
		}else if(this.entities[key].type == 'audience/count-group'){
			//if(this.entities[key].choices[content.vote] === undefined) return false;
			if(!this.entities[key].choices[content.vote]) this.entities[key].choices[content.vote] = 0;
			this.entities[key].choices[content.vote] += 1 * (content.times !== undefined && content.times > -1 ? content.times : 1);
		}else if(this.entities[key].type == 'audience/g-counter'){
			this.entities[key].count += 1 * (content.times !== undefined && content.times > -1 ? content.times : 1);
		}else if(this.entities[key].type == 'audience/pn-counter'){
			this.entities[key].count += 1 * (content.times !== undefined && content.times > -1 ? content.times : 1);
		}else{
			return false;
		}
		this.entities[key].version++;
		return true;
	}
	
	// number, audience/pn-counter
	decrement(key){
		if(!this.entities[key]) return null;
		if(this.entities[key].type == 'number'){
			this.entities[key].val -= this.entities[key].restrictions.increment;
			if(
				this.entities[key].restrictions.min !== undefined &&
				this.entities[key].restrictions.min.constructor == Number &&
				this.entities[key].val < this.entities[key].restrictions.min
			) this.entities[key].val = this.entities[key].restrictions.min;
		}else if(this.entities[key].type == 'audience/pn-counter'){
			this.entities[key].count -= 1 * (content.times !== undefined && content.times > -1 ? content.times : 1);
		}else{
			return false;
		}
		this.entities[key].version++;
		return true;
	}
	
	// text-map
	sync(key, content, playerId){
		if(!this.entities[key]) return null;
		/*this.entities[key].n.wsClient.emit("text-map/synced", {
			key,
			msg: content.msg
		});*/
		this.entities[key].n.handleTextMapUpdate(content);
		this.sendByAcl(this.entities[key].acl, {
			opcode: "text-map/synced",
			result: {
				key,
				msg: content.msg,
				from: playerId
			}
		}, this.entities[key].notifyHost);
	}
	
	// doodle
	stroke(key, content, playerId){
		if(!this.entities[key]) return null;
		let line = {
			brush: content.brush,
			color: content.color,
			weight: content.weight,
			layer: content.layer,
			points: content.points,
			index: this.entities[key].val.nextLineIndex++
		};
		this.entities[key].val.lines.push(line);
		if(this.entities[key].val.live) this.sendMsg(this.entities[key].from, {
			opcode: 'doodle/line',
			result: {
				key,
				from: playerId,
				val: line
			}
		});
		return true;
	}
	
	// doodle
	undo(key, playerId){
		if(!this.entities[key]) return null;
		if(this.entities[key].val.lines.length < 1) return false;
		let removedLine = this.entities[key].val.lines.pop();
		if(this.entities[key].val.live) this.sendMsg(this.entities[key].from, {
			opcode: 'doodle/line/removed',
			result: {
				key,
				from: playerId,
				index: removedLine.index
			}
		});
		return true;
	}
	
	// stack, audience/text-ring
	push(key, content){
		if(!this.entities[key]) return null;
		if(this.entities[key].type == 'stack'){
			this.entities[key].vals.push(content.val);
			this.sendMsg(this.entities[key].from, {
				opcode: 'stack/element',
				result: {
					key,
					val: content.val
				}
			});
		}else if(this.entities[key].type == 'audience/text-ring'){
			if(this.entities[key].elements.length <= this.entities[key].limit)
				this.entities[key].elements.shift();
			this.entities[key].elements.push({
				ts: parseInt(Date.now()/1000),
				value: content.text
			});
		}else return false;
		return true;
	}
	
	// stack
	bulkpush(key, content){
		if(!this.entities[key]) return null;
		if(this.entities[key].type == 'stack'){
			this.entities[key].vals.push(...content.vals);
			this.sendMsg(this.entities[key].from, {
				opcode: 'stack/elements',
				result: {
					key,
					vals: content.vals
				}
			});
		}else return false;
		return true;
	}
	
	// stack
	peek(key, content){
		if(!this.entities[key]) return null;
		return false;
	}
	
	// stack
	pop(key){
		if(!this.entities[key]) return null;
		return false;
	}
	
	drop(key){
		if(!this.entities[key]) return null;
		if(this.entities[key].type == 'text-map') this.entities[key].n.handleShutdown();
		delete this.entities[key];
	}
	
	lock(key){
		if(!this.entities[key] || !utils.isEntityLocked(this.entities[key].acl)) return null;
		for(let i = 0; i < his.entities[key].acl.length; i++)
			this.entities[key].acl[i].write = false;
	}
}

module.exports = Room;
