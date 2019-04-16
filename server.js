/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var path = require('path');
var express = require('express');
var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var fs    = require('fs');
var http = require('http');
var jayson = require('jayson');
require('dotenv').load();

var argv = minimist(process.argv.slice(2), {
  default: {
      as_uri: "https://localhost:8443/",
      ws_uri: "ws://localhost:8888/kurento"
  }
});

// var options =
// {
//   key:  fs.readFileSync('keys/server.key'),
//   cert: fs.readFileSync('keys/server.crt')
// };

var app = express();

/*
 * Definition of global variables.
 */

var kurentoClient = null;
var userRegistry = new UserRegistry();
var pipelines = {};
var candidatesQueue = {};
var idCounter = 0;

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}
var clientApiGateway = jayson.client.http(process.env.API_GATEWAY_URL);
// clientApiGateway.request('establishToKMS',null,function(error,count) {
//     console.log('number of KMS ' + count.result);
// })
/*
 * Definition of helper classes
 */

// Represents caller and callee sessions
function UserSession(id, name, socket) {
    this.id = id;
    this.name = name;
    this.socket = socket;
    this.peer = null;
    this.sdpOffer = null;
}

UserSession.prototype.sendMessage = function(message) {
    this.socket.emit('server-message',JSON.stringify(message));
}

// Represents registrar of users
function UserRegistry() {
    this.usersById = {};
    this.usersByName = {};
}

UserRegistry.prototype.register = function(user) {
    this.usersById[user.id] = user;
    this.usersByName[user.name] = user;
}

UserRegistry.prototype.unregister = function(id) {
    var user = this.getById(id);
    if (user) delete this.usersById[id];
        
    if (user && this.getByName(user.name)) delete this.usersByName[user.name];
}

UserRegistry.prototype.getById = function(id) {
    return this.usersById[id];
}

UserRegistry.prototype.getByName = function(name) {
    return this.usersByName[name];
}

UserRegistry.prototype.getAllUser = function() {
    return Object.values(this.usersById);
}

UserRegistry.prototype.removeById = function(id) {
    var userSession = this.usersById[id];
    if (!userSession) return;
    delete this.usersById[id];
    delete this.usersByName[userSession.name];
}

// Represents a B2B active call
function CallMediaPipeline() {
    this.pipeline = null;
    this.webRtcEndpoint = {};
    this.session = null;
    this.clusterId = 0;
    this.callerId = 0
    this.calleeId = 0;
}

CallMediaPipeline.prototype.createPipeline = function(callerId, calleeId, socket, callback) {
    var self = this;
    getKurentoClient(function(error, clusterId) {
        if (error) {
            return callback(error);
        }
        self.clusterId = clusterId;
        self.callerId = callerId;
        self.calleeId = calleeId;
        createMediaPipeline(clusterId,function(error, pipeline) {
            if (error) {
                return callback(error);
            }
            self.pipeline = pipeline.value;
            self.session = pipeline.sessionId;
            createMediaElement(pipeline, clusterId,function(error, callerWebRtcEndpoint) {
                if (error) {
                    return callback(error);
                }

                if (candidatesQueue[callerId]) {
                    while(candidatesQueue[callerId].length) {
                        var candidate = candidatesQueue[callerId].shift();
                        addIceCandidate(callerWebRtcEndpoint,candidate,pipeline.sessionId,clusterId);
                    }
                }


                subscribeIceCandidate(callerWebRtcEndpoint,pipeline.sessionId,clusterId);

               
                createMediaElement(pipeline,clusterId,function(error, calleeWebRtcEndpoint) {
                    if (error) {
                        return callback(error);
                    }
                    if (candidatesQueue[calleeId]) {
                        while(candidatesQueue[callerId].length) {
                            var candidate = candidatesQueue[callerId].shift();
                            addIceCandidate(calleeWebRtcEndpoint,candidate,pipeline.sessionId,clusterId);
                        }
                    }

                    self.webRtcEndpoint[callerId] = callerWebRtcEndpoint;
                    self.webRtcEndpoint[calleeId] = calleeWebRtcEndpoint;
                   

                    subscribeIceCandidate(calleeWebRtcEndpoint,pipeline.sessionId,clusterId);

                    connectElements(callerWebRtcEndpoint, calleeWebRtcEndpoint,pipeline.sessionId,clusterId,function(error,response) {
                        if (error) {
                            return callback(error);
                        }
                        console.log(response);
                        connectElements(calleeWebRtcEndpoint,callerWebRtcEndpoint,pipeline.sessionId,clusterId,function(error,response) {
                            if (error) {
                                return callback(error);
                            }
                            console.log(response);
                        });

                
                        callback(null);
                    });
                });
            });
        });
    })
}

CallMediaPipeline.prototype.generateSdpAnswer = function(id, sdpOffer, callback) {
    var webRtcEndpoint = this.webRtcEndpoint[id];
    var sessionId = this.session;
    var clusterId = this.clusterId;
    var params = {
        object : webRtcEndpoint,
        operation : 'processOffer',
        operationParams:{
            offer :sdpOffer
        },
        sessionId :sessionId
    };
    clientApiGateway.request('processOffer',[clusterId, params],function(err,sdpAnswer){
        if(err) return callback(err);
        callback(null,sdpAnswer.result.value);
    });

    var params = {
        object : webRtcEndpoint,
        operation : 'gatherCandidates',
        operationParams:{
            offer : sdpOffer
        },
        sessionId :sessionId
    };

    clientApiGateway.request('gatherCandidates',[clusterId, params],function(err,response) {
        if(err) return callback(err);
    });    


}

CallMediaPipeline.prototype.release = function() {
    this.pipeline = null;
}

/*
 * Server startup
 */

var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
// var server = https.createServer(options, app).listen(port, function() {
//     console.log('Kurento Tutorial started');
//     console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
// });;

var httpServer = require('http').createServer(app);
httpServer.listen(process.env.PORT || 8443);

// server.listen(port, function() {
//     console.log('Kurento Tutorial started');
//     console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
// });
// var io = require('socket.io').listen(server);
var io = require('socket.io').listen(httpServer);

// var wss = new ws.Server({
//     server : server,
//     path : '/one2one'
// });

io.on('connection', function(socket) {
    var sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);
    // socket.emit('server-message','test');
    socket.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error: ' +error);
        stop(sessionId);
    });

    socket.on('disconnect', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
        userRegistry.unregister(sessionId);
    });

    socket.on('candidate', function(_message) {
        var msgObj = JSON.parse(_message);
        var candidate = msgObj.value.data.candidate;
        var object = msgObj.value.object
        var listPipeline = Object.values(pipelines);

        for(i=0; i<listPipeline.length; i++) {
            var pipeline = listPipeline[i];
            var callerId = pipeline.callerId;
            var calleeId = pipeline.calleeId;
            if(object == pipeline.webRtcEndpoint[callerId]) {
                var user = userRegistry.getById(callerId);
                user.sendMessage({
                    id : 'iceCandidate',
                    candidate : candidate
                });
                break;
            }
            if(object == pipeline.webRtcEndpoint[calleeId]) {
                var user = userRegistry.getById(calleeId);
                user.sendMessage({
                    id : 'iceCandidate',
                    candidate : candidate
                });
                break;
            }
        }
    });

    socket.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'register':
            register(sessionId, message.name, socket);
            break;

        case 'call':
            call(sessionId, message.to, message.from, message.sdpOffer);
            break;

        case 'incomingCallResponse':
            incomingCallResponse(sessionId, message.from, message.callResponse, message.sdpOffer, socket);
            break;

        case 'stop':
            stop(sessionId);
            break;

        case 'onIceCandidate':
            onIceCandidate(sessionId, message.candidate);
            break;

        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }

    });
});

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {

    // if(clientApiGateway ==null){
    //     clientApiGateway = jayson.client.http(process.env.API_GATEWAY_URL);
    // }

   clientApiGateway.request('getKurentoClient',null,function(error,clusterId) {
        if(clusterId) {
            console.log('cluster id '+clusterId.result);
            return callback(null,clusterId.result);
        }        
    });

}

function createMediaPipeline(clusterId ,callback){
    var params = {
        type : 'MediaPipeline',
        constructorParams : {},
        properties : {}    
    };
    clientApiGateway.request('createPipeline',[clusterId, params],function(err,pipeline) {
        if(err) return callback(err);
        console.log('pipeline ' +JSON.stringify(pipeline));
        callback(null,pipeline.result);
    });
           
}

function createMediaElement(pipeline,clusterId,callback){

    var params = {
        type: "WebRtcEndpoint",
        constructorParams: {
            mediaPipeline : pipeline.value
        },
        properties : {},    
        sessionId : pipeline.sessionId
    };

   clientApiGateway.request('createWebRtcEndpoint',[clusterId, params],function(err,webRtcEndpoint){
        if(err) return callback(err);
        console.log('webrtc endpoint ' +JSON.stringify(webRtcEndpoint));
        callback(null,webRtcEndpoint.result.value);
    });
       
}

function addIceCandidate(webRtcEndpoint,candidate,sessionId,clusterId) {
    var params = {
        object : webRtcEndpoint,
        operation : 'addIceCandidate',
        operationParams:{
            candidate : candidate
        },
        sessionId :sessionId
    };

    clientApiGateway.request('addCandidate',[clusterId, params],function(err,response){}); 
}

function subscribeIceCandidate(webRtcEndpoint,sessionId,clusterId){
    var params = {
        type : 'OnIceCandidate',
        object: webRtcEndpoint,
        sessionId : sessionId
    };
    clientApiGateway.request('onIceCandidate',[clusterId, params],function(err,response){});
}

function connectElements(webRtcEndpoint1,webRtcEndpoint2,sessionId,clusterId,callback){

    var params = {
        object : webRtcEndpoint1,
        operation : 'connect',
        operationParams:{
            sink : webRtcEndpoint2
        },
        sessionId :sessionId
    };  
    clientApiGateway.request('connect', [clusterId, params],function(err,response){
        if (err) return callback(err);
        var message = 'successfully conneted';
        callback(null,message);
    });
}

function stop(sessionId) {
    if (!pipelines[sessionId]) {
        return;
    }

    var pipelineObject = pipelines[sessionId];
    var clusterId = pipelineObject.clusterId;
    var session = pipelineObject.session;
    var pipeline = pipelineObject.pipeline;

    if(session) {
        var params ={
            object : pipeline,
            sessionId : session
        }
        clientApiGateway.request('release', [clusterId, params],function(err,response){
            if (err) return console.log('error release' +err);
        });
    }
    delete pipelines[sessionId];
    pipelineObject.release();
    var stopperUser = userRegistry.getById(sessionId);
    var stoppedUser = userRegistry.getByName(stopperUser.peer);
    stopperUser.peer = null;

    if (stoppedUser) {
        stoppedUser.peer = null;
        delete pipelines[stoppedUser.id];
        var message = {
            id: 'stopCommunication',
            message: 'remote user hanged out'
        }
        stoppedUser.sendMessage(message)
    }

    clearCandidatesQueue(sessionId);
}

function incomingCallResponse(calleeId, from, callResponse, calleeSdp, socket) {

    clearCandidatesQueue(calleeId);

    function onError(callerReason, calleeReason) {
        if (pipeline) pipeline.release();
        if (caller) {
            var callerMessage = {
                id: 'callResponse',
                response: 'rejected'
            }
            if (callerReason) callerMessage.message = callerReason;
            caller.sendMessage(callerMessage);
        }

        var calleeMessage = {
            id: 'stopCommunication'
        };
        if (calleeReason) calleeMessage.message = calleeReason;
        callee.sendMessage(calleeMessage);
    }

    var callee = userRegistry.getById(calleeId);
    if (!from || !userRegistry.getByName(from)) {
        return onError(null, 'unknown from = ' + from);
    }
    var caller = userRegistry.getByName(from);

    if (callResponse === 'accept') {
        var pipeline = new CallMediaPipeline();
        pipelines[caller.id] = pipeline;
        pipelines[callee.id] = pipeline;
        console.log('caller id ' + caller.id);
        console.log('callee id ' + callee.id);

        pipeline.createPipeline(caller.id, callee.id, socket, function(error) {
            if (error) {
                return onError(error, error);
            }

            pipeline.generateSdpAnswer(caller.id, caller.sdpOffer, function(error, callerSdpAnswer) {
                if (error) {
                    return onError(error, error);
                }

                pipeline.generateSdpAnswer(callee.id, calleeSdp, function(error, calleeSdpAnswer) {
                    if (error) {
                        return onError(error, error);
                    }

                    var message = {
                        id: 'startCommunication',
                        sdpAnswer: calleeSdpAnswer
                    };
                    callee.sendMessage(message);

                    message = {
                        id: 'callResponse',
                        response : 'accepted',
                        sdpAnswer: callerSdpAnswer
                    };
                    caller.sendMessage(message);
                });
            });
        });
    } else {
        var decline = {
            id: 'callResponse',
            response: 'rejected',
            message: 'user declined'
        };
        caller.sendMessage(decline);
    }
}

function call(callerId, to, from, sdpOffer) {
    clearCandidatesQueue(callerId);

    var caller = userRegistry.getById(callerId);
    var rejectCause = 'User ' + to + ' is not registered';
    if (userRegistry.getByName(to)) {
        var callee = userRegistry.getByName(to);
        caller.sdpOffer = sdpOffer
        callee.peer = from;
        caller.peer = to;
        var message = {
            id: 'incomingCall',
            from: from
        };
        try{
            return callee.sendMessage(message);
        } catch(exception) {
            rejectCause = "Error " + exception;
        }
    }
    var message  = {
        id: 'callResponse',
        response: 'rejected: ',
        message: rejectCause
    };
    caller.sendMessage(message);
}

function register(id, name, socket) {
    function onError(error) {
        socket.emit('server-message',JSON.stringify({id:'registerResponse', response : 'rejected ', message: error}));
    }

    if (!name) {
        return onError("empty user name");
    }

    if (userRegistry.getByName(name)) {
        return onError("User " + name + " is already registered");
    }
    userRegistry.register(new UserSession(id, name, socket));
    console.log('register successful');
    // try {
    //     socket.emit('message',JSON.stringify({id: 'registerResponse', response: 'accepted'}));
    // } catch(exception) {
    //     onError(exception);
    // }
    var message = {
        id : 'registerResponse',
        response : 'accepted'
    }

    socket.emit('server-message',JSON.stringify(message));

}

function clearCandidatesQueue(sessionId) {
    // if (candidatesQueue[sessionId]) {
    //     delete candidatesQueue[sessionId];
    // }
}

function onIceCandidate(sessionId, _candidate) {
    var user = userRegistry.getById(sessionId);
    if(user) { 
        var pipeline = pipelines[user.id];
        if (pipeline && pipeline.webRtcEndpoint && pipeline.webRtcEndpoint[user.id]) {
            var session = pipeline.session;
            var clusterId = pipeline.clusterId;
            var webRtcEndpoint = pipeline.webRtcEndpoint[user.id];
            var params = {
                object : webRtcEndpoint,
                operation : 'addIceCandidate',
                operationParams:{
                    candidate : _candidate
                },
                sessionId :session
            };
            clientApiGateway.request('addCandidate',[clusterId, params],function(err,response){});
        }
        else {
            if (!candidatesQueue[user.id]) {
                candidatesQueue[user.id] = [];
            }
            candidatesQueue[sessionId].push(_candidate);
        }
    }
}

app.use(express.static(path.join(__dirname, 'static')));
