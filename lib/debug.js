const express = require("express");
const router = express.Router();

function parseObject(object, exclude){
    //let result = JSON.parse(JSON.stringify(object));
    let result = Object.assign({}, object);
    exclude && exclude.split(',').forEach(field => {
        if(result[field] !== undefined) delete result[field];
    });
    return result;
}

function replacer(key, value){
    return value && value.debugIgnore ? "[debug ignore]" : value;
}

router.get("/debug", (req, res) => {
    //let result = JSON.parse(JSON.stringify(global.jbg));
    let result = Object.assign({}, global.jbg);
    result.polly = result.polly.toString();
    res.header("Content-Type", "application/json");
    return res.send(JSON.stringify(parseObject(result, req.query.exclude), replacer, 4));
});

router.get("/debug/rooms", (req, res) => {
    res.header("Content-Type", "application/json");
    return res.send(JSON.stringify(Object.keys(global.jbg.rooms), replacer, 4));
});

router.get("/debug/rooms/:roomId", (req, res) => {
	let room = global.jbg.rooms[req.params.roomId];
	if(!room) return res.status(404).send({
		error: "no such room"
	});
	//let result = JSON.parse(JSON.stringify(room));
    let result = Object.assign({}, room);
    if(result.destroyTimeout) result.destroyTimeout = result.destroyTimeout.toString();
    //for(let entity of Object.keys(result.entities))
        //if(result.entities[entity].n)
            //result.entities[entity].n = result.entities[entity].n.toString();
	if(req.query.noMessages == 'true') delete result.messages;
	res.header("Content-Type", "application/json");
	return res.send(JSON.stringify(parseObject(result, req.query.exclude), replacer, 4));
});

router.get("/debug/users", (req, res) => {
    let result = {};
    Object.keys(global.jbg.wsIds).forEach(wsId => {
        result[wsId] = {
            id: global.jbg.wsIds[wsId].id,
            seq: global.jbg.wsIds[wsId].seq,
            jbg: global.jbg.wsIds[wsId].jbg
        };
        if(result[wsId].jbg.ping) result[wsId].jbg.ping = result[wsId].jbg.ping.toString();
    });
    res.header("Content-Type", "application/json");
    return res.send(JSON.stringify(parseObject(result, req.query.exclude), replacer, 4));
});

router.get("/debug/users/:wsId", (req, res) => {
	let user = global.jbg.wsIds[req.params.wsId];
	if(!user) return res.status(404).send({
		error: "no such user"
	});
	let result = {
        id: global.jbg.wsIds[req.params.wsId].id,
        seq: global.jbg.wsIds[req.params.wsId].seq,
        jbg: global.jbg.wsIds[req.params.wsId].jbg
    };
    if(result.jbg.ping) result.jbg.ping = result.jbg.ping.toString();
	res.header("Content-Type", "application/json");
	return res.send(JSON.stringify(parseObject(result, req.query.exclude), replacer, 4));
});

router.get("/debug/external-requests", (req, res) => {
    res.header("Content-Type", "application/json");
    return res.send(JSON.stringify(Object.keys(parseObject(global.jbg.externalRequests, req.query.exclude)), replacer, 4));
});

router.get("/debug/external-requests/:token", (req, res) => {
	let externalRequest = global.jbg.externalRequests[req.params.token];
	if(!externalRequest) return res.status(404).send({
		error: "no such external request"
	});
	res.header("Content-Type", "application/json");
	return res.send(JSON.stringify(parseObject(externalRequest, req.query.exclude), replacer, 4));
});

module.exports = {
    router
};
