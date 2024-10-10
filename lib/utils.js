const request = require('request');
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

function getMessage(msg, server, roomId, userId){
	if((server == 'ecast' && msg.opcode) || (server == 'blobcast' && (msg.event !== undefined || msg.action !== undefined))) return msg;
	var result = {};
	console.log(msg, server);
	if(server == 'blobcast'){
		if(msg.opcode == 'client/connected' && msg.result.role == 'player'){
			result = {
				type: "Event",
				event: msg.result.reconnect ? "CustomerRejoinedRoom" : "CustomerJoinedRoom",
				roomId,
				customerUserId: msg.result.userId,
				customerName: msg.result.name,
				options: {
					roomcode: "",
					name: msg.result.name,
					email: "",
					phone: ""
				}
			};
		}else if((msg.opcode == 'client/disconnected' || msg.opcode == 'client/kicked') && msg.result.role == 'player'){
			result = {
				type: "Event",
				event: "CustomerLeftRoom",
				roomId,
				//customerUserId: ""
				customerUserId: userId
			};
		}else if(msg.opcode == 'client/send'){
			result = {
				type: "Event",
				event: "CustomerMessage",
				roomId,
				userId,
				message: msg.result.body
			};
		}else if(msg.opcode == 'client/welcome' && global.jbg.rooms[roomId].host.userId != userId){
			result = {
				type: "Result",
				action: "JoinRoom",
				success: true,
				initial: !msg.result.reconnect,
				//initial: false,
				roomId,
				joinType: msg.result.profile?'player':'audience',
				userId,
				options: {
					roomcode: "",
					name: msg.result.name,
					email: "",
					phone: ""
				},
				action: "JoinRoom"
			}
		}else if(msg.opcode == 'room/exit'){
			result = {
				type: "Event",
				event: "RoomDestroyed",
				roomId
			};
		}else if(msg.opcode == 'object' && msg.result.key.startsWith('bc:')){
			result = {
				type: "Event",
				event: "CustomerBlobChanged",
				roomId,
				blob: msg.result.val
			};
			if(msg.result.key == 'bc:room') result.event = "RoomBlobChanged";
		}
	}else if(server == 'ecast'){
		
	}
	return result;
}

function isJson(data){
	try{
		if(typeof data == 'string') JSON.parse(data)
		else JSON.stringify(data)
		return true;
	}catch(e){
		return false;
	}
}

module.exports = {
	parseUrl: url => {
		var res = {url: url.split('?')[0], query: {}};
		if(url.split('?').length == 2){
			url.split('?')[1].split('&').forEach((param) => {
				if(param.split("=").length == 2){
					res.query[param.split("=")[0]] = param.split("=")[1];
				}
			});
		}
		if(res.query.name) res.query.name = decodeURIComponent(res.query.name);
		return res;
	},
	isJson,
	toJson: data => JSON.stringify(data),
	checkBlobcastMessage: data => {
		let success = true;
		if(!data.name) success = false
		if(data.args && data.args.constructor == Array){
			data.args.forEach(arg => {
				if(!arg.action || !arg.appId || !global.jbg.games.appIds[arg.appId]) success = false;
			});
		}else if(data.args){
			if(!data.args.action || !data.args.appId || !global.jbg.games.appIds[data.args.appId]) success = false;
		}else{
			success = false;
		}
		return success;
	},
	checkEcastMessage: data => typeof data.opcode === 'string' && data.params.constructor === Object,
	randomId: (min, max) => Math.floor(Math.random() * (max - min) + min),
	make: needed => {
		var result = '';
		var length = 0;
		var characters = '';
		if(needed == 'room'){
			var length = 4;
			var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		}else if(needed == 'token'){
			var length = 24;
			var characters = '0123456789abcdef';
		}else if(needed == 'contentId'){
			var length = 7;
			var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		}else if(needed == 'artifactId'){
			var length = 32;
			var characters = '0123456789abcdef';
		}
		var charactersLength = characters.length;
		for(var i = 0; i < length; i++){
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	},
	checkQuery: query => {
		var roles = ['host', 'player', 'moderator', 'audience'/*, 'shard', 'harold'*/];
		if(typeof query.role === 'undefined' || typeof query.name === 'undefined' || typeof query.format === 'undefined' || roles.indexOf(query.role) == -1 || query.format != 'json'){
			return false;
		}else{
			if(query.role == 'player' || query.role == 'audience'){
				if(typeof query['user-id'] === 'undefined'){
					return false;
				}else{
					return true;
				}
			}else if(query.role == 'host'){
				if(typeof query['user-id'] === 'undefined' || typeof query['host-token'] === 'undefined'){
					return false;
				}else{
					return true;
				}
			}else{
				return true;
			}
		}
	},
	parseAcl: _acl => {
		var acls = [];
		_acl.forEach(acl => {
			acl = acl.split(' ');
			if(acl.length == 2){
				result = {
					read: false,
					write: false,
					to: '',
					playerId: null
				};
				if(acl[0].indexOf('r') !== -1) result.read = true;
				if(acl[0].indexOf('w') !== -1) result.write = true;
				if(acl[1] == '*'){
					result.to = 'all';
				}else if(acl[1].startsWith('role:') && acl[1].split(':').length == 2){
					result.to = acl[1].split(':')[1];
				}else if(acl[1].startsWith('id:') && acl[1].split(':').length == 2){
					result.to = 'id';
					result.playerId = acl[1].split(':')[1];
				}
				return acls.push(result);
			}else{
				return acls.push({
					read: false,
					write: false,
					to: '',
					playerId: null
				});
			}
		});
		return acls;
	},
	getClient: id => global.jbg.wsIds[id],	
	getMessage,
	sendToAudience: (roomId, msg) => {
		Object.keys(global.jbg.wsIds).forEach(wsId => {
			if(global.jbg.wsIds[wsId].jbg.room == roomId && global.jbg.wsIds[wsId].jbg.isAudience)
				global.jbg.wsIds[wsId].sendMsg(getMessage(msg, global.jbg.wsIds[wsId].jbg.server, roomId));
		});
	},
	isEntityForPlayer: (acls, role, playerId) => {
		let result = false;
		acls.forEach(acl => {
			if(
				acl.to == 'all' ||
				(acl.to == 'id' && acl.playerId == playerId) ||
				(acl.to == role)
			) result = true;
		});
		return result;
	},
	isEntityLockedForPlayer: (acls, role, playerId) => {
		let canWrite = false;
		acls.forEach(acl => {
			if(
				acl.to == 'all' ||
				(acl.to == 'id' && acl.playerId == playerId) ||
				(acl.to == role)
			) if(!canWrite) canWrite = acl.write;
		});
		return !canWrite;
	},
	isEntityReadableForPlayer: (acls, role, playerId) => {
		let result = false;
		acls.forEach(acl => {
			if(
				acl.to == 'all' ||
				(acl.to == 'id' && acl.playerId == playerId) ||
				(acl.to == role)
			) if(!result) result = acl.read;
		});
		return result;
	},
	isEntityLocked: (acls, role, playerId) => {
		let canWrite = false;
		acls.forEach(acl => {
			if(!canWrite) canWrite = acl.write;
		});
		return !canWrite;
	},
	checkTwitchToken: token => {
		let xhr = new XMLHttpRequest();
		xhr.open("GET", "https://api.twitch.tv/helix/users", false);
		xhr.setRequestHeader('Authorization', 'Bearer '+token);
		xhr.setRequestHeader('Client-ID', 'yn2iepd23vskpmkzgeg2lkfsct7gsc'); // from jackbox.tv
		xhr.send();
		return JSON.parse(xhr.responseText);
	},
	checkEntityParams: (type, action, params) => {
		let success = true;
		if(type == "number"){
			if((action == 'increment' || action == 'decrement') && params.val < 0) success = false;
		}else if(type == "object"){
			if(params.val === undefined || !isJson(params.val)) success = false;
		}else if(type == "text"){
			if(params.val === undefined || typeof params.val !== 'string') success = false;
			if(params.val === null) success = true;
		}else if(type == "text-map"){
			if(action == 'create'){
				if(params.val === undefined || typeof params.val !== 'string') success = false;
			}else if(action == 'sync'){
				if(params.msg === undefined || typeof params.msg !== 'string') success = false;
			}
		}else if(type == "doodle"){
			if(action == 'create'){
			}else if(action == 'stroke'){
				if(params.color === undefined || typeof params.color !== 'string') success = false;
				if(params.weight === undefined || typeof params.weight !== 'number') success = false;
				if(params.layer === undefined || typeof params.layer !== 'number') success = false;
				if(params.points === undefined || typeof params.points !== 'object') success = false;
			}
		}else if(type == "stack"){
			
		}else if(type == "audience/count-group"){
			if(action == 'increment' && params.times < 0) success = false;
		}else if(type == "audience/g-counter"){
			if(action == 'increment' && params.times < 0) success = false;
		}else if(type == "audience/pn-counter"){
			if((action == 'increment' || action == 'decrement') && params.times < 0) success = false;
		}else if(type == "audience/text-ring"){
			if(action == 'create')
				if(params.limit === undefined || typeof params.limit !== 'number') success = false;
			else if(action == 'push'){
				if(params.text === undefined || typeof params.text !== 'string') success = false;
			};
		}else if(type == "artifact"){
			if(typeof params.appId !== 'string' || typeof params.categoryId !== 'string' || typeof params.blob !== 'object') success = false;
		}else if(type == "external-request"){
			if(typeof params.service !== 'string' || typeof params.payload != 'object') success = false;
		}else{
			//success = false;
			success = null;
		}
		return success;
	},
	getEntityParams: (type, action, params) => {
		let result = {};
		if(type == "number"){
			if(action == "create" || action == "update") result = {
				val: params.val || 0,
				//restrictions: params.restrictions || {increment: 0, type: "float"}
				restrictions: {
					increment: params.increment || 0,
					type: params.type || "int",
					max: params.max || undefined,
					min: params.min || undefined
				}
			};
		}else if(type == "object"){
			result = {
				val: params.val || {}
			};
		}else if(type == "text"){
			result = {
				val: params.val || "",
				accept: params.accept || undefined
			};
		}else if(type == "text-map"){
			if(action == 'create') result = {
				notifyHost: params.notifyHost || false,
				val: params.val || ""
			};
			else if(action == 'sync') result = {
				msg: params.msg || ""
			};
		}else if(type == "doodle"){
			if(action == 'create') result = {
				colors: params.colors || null,
				live: params.live || false,
				maxLayer: params.maxLayer || 0,
				maxPoints: params.maxPoints || 0,
				size: params.size || {height: 0, width: 0},
				weights: params.weights || null
			};
			else if(action == 'stroke') result = {
				brush: params.brush || undefined,
				color: params.color || "#ffffff",
				weight: params.weight || 0,
				layer: params.layer || 0,
				points: params.points || []
			};
		}else if(type == "stack"){
			if(action == "push") result = {
				val: params.val || ""
			};
			else if(action == "bulkpush") result = {
				vals: params.vals || []
			};
			else if(action == "peek") result = {
				size: params.size || 0
			};
		}else if(type == "audience/count-group"){
			if(action == "create") result = {
				options: params.options || []
			};
			if(action == "increment") result = {
				vote: params.vote || "",
				times: params.times || 0
			};
		}else if(type == "audience/g-counter"){
			if(action == "create") result = {
				count: params.count || 0
			};
			if(action == "increment") result = {
				times: params.times || 0
			};
		}else if(type == "audience/pn-counter"){
			if(action == "create") result = {
				count: params.count || 0
			};
			if(action == "increment" || action == "decrement") result = {
				times: params.times || 0
			};
		}else if(type == "audience/text-ring"){
			if(action == "create") result = {
				limit: params.limit || 0,
				commentsPerPoll: params.commentsPerPoll || 10 // for blobcast
			};
			if(action == "push") result = {
				text: params.text || ""
			};
		}else if(type == "artifact"){
			if(action == "create") result = {
				appId: params.appId || undefined,
				blob: params.blob || undefined,
				categoryId: params.categoryId || undefined,
				hasRefs: params.hasRefs || false
			};
		}else if(type == "external-request"){
			if(action == "create") result = {
				service: params.service || undefined,
				payload: params.payload || undefined
			};
		}
		return result;
	}
};
