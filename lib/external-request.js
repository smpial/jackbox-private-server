const request = require('request');
const express = require("express");
const router = express.Router();
const utils = require("./utils.js");

const services = {
    'song-render': 'http://localhost:82/external-request/create'
};
const servicesRoles = {
    'song-render': 'harold'
};

function done(token, success, response){
    let data = global.jbg.externalRequests[token];
    if(!data) return null;
    global.jbg.externalRequests[token].done = true;
    global.jbg.externalRequests[token].success = success;
    global.jbg.externalRequests[token].response = response;
    let room = global.jbg.rooms[data.roomID];
    if(!room) return null;
    if(!room.get(data.entityKey)) return null;
    let role = servicesRoles[data.service];
    if(!room.isDummyRoleInRoom(role)){
        let haroldId = room.getNextProfileId();
        room.dummy[haroldId] = {
            role
        };
    }
    let playerId = room.getDummyRolePlayerId(role);
    room.entities[data.entityKey].val = {
        status: success ? "success" : "error",
        service: data.service,
        response
    };
    room.entities[data.entityKey].from = playerId;
    room.entities[data.entityKey].version++;
    room.notifyEntity(data.entityKey, true);
    return true;
}

function create(roomID, entityKey, params){
    let token = utils.make('token');
    if(!services[params.service]) return done(token, false, {});
    if(!global.jbg.rooms[roomID]) return done(token, false, {});
    if(!global.jbg.rooms[roomID].get(entityKey)) return done(token, false, {});
    return done(token, false, {}); // temp
    /* 
    It is planned to send a POST to the server that will handle rendering
    (for now, only song-render is used in external-request) and send a POST
    request back to this server with the result
    */
    /*params.token = token;
    global.jbg.externalRequests[token] = {roomID, entityKey, service: params.service, done: false, params};
    request({
        method: "POST",
        url: services[params.service],
        headers: {
            'x-internal-token': global.jbg.internalToken
        },
        json: params
    }, (error, response, body) => {
        if(error || response.statusCode !== 200) return done(token, false, {});
    });*/
}

router.post('/external-request/done', (req, res) => {
    if(!global.jbg.externalRequests[req.body.token]) return res.sendStatus(404);
    if(global.jbg.externalRequests[req.body.token].done) return res.sendStatus(403);
    let success = done(req.body.token, req.body.success, req.body.response);
    if(success) return res.sendStatus(200);
    else return res.sendStatus(500);
});

module.exports = {
    router,
    create
};
