require('debugger/DevToolsUtils.js', "debug");
require('debugger/core/promise.js', "debug");
require('debugger/transport.js', "debug");
require('debugger/actors/root.js', "debug");
require('debugger/actors/script.js', "debug");
require('debugger/main.js', "debug");


dbg = {
  LONG_STRING_LENGTH: 10000,
  LONG_STRING_INITIAL_LENGTH: 1000,
  LONG_STRING_READ_LENGTH: 1000
};
dbg.log = log;

var globalDebuggee = null;

var textCommandProcessor = {};

textCommandProcessor.break = function (str) {
    var md = str.match(/^b(reak)?\s+([^:]+):(\d+)/);

    if (!md) {
        return ({commandname : "break",
                 success : false,
                 stringResult : "command could not be parsed"});
    }

	var scripts = dbg.scripts[md[2]],
	tmpScript = null;
	if (scripts) {
		var breakLine = parseInt(md[3], 10),
		off = -1;
		for (var n=0; n < scripts.length; n++) {
			offsets = scripts[n].getLineOffsets(breakLine);
			if (offsets.length > 0) {
				off = offsets[0];
				tmpScript = scripts[n];
				break;
			}
		}
		if (off >= 0) {
			tmpScript.setBreakpoint(off, breakpointHandler);
            return ({commandname : "break",
                     success : true,
                     jsfilename : md[2],
                     breakpointlinenumber : breakLine});
		} else {
            return ({commandname : "break",
                     success : false,
                     stringResult : "no valid offsets at that line"});
		}
	} else {
        return ({commandname : "break",
                 success : false,
                 jsfilename : md[2],
                 stringResult : "Invalid script name"});
	}
}

textCommandProcessor.info = function (str) {
    var report = "";

    var md = str.match(/^info\s+(\S+)/);
	if (md) {
        report += "info - NYI";
        report += "\nmd[0] = " + md[0];
        report += "\nmd[1] = " + md[1];

        return ({commandname : "info",
                 success : true,
                 stringResult : report});
	} else {
        return ({commandname : "info",
                 success : false,
                 stringResult : report});
    }
}

textCommandProcessor.clear = function (str) {
    var report = "";

    report += "clearing all breakpoints";

    dbg.dbg.clearAllBreakpoints();
    return ({commandname : "clear",
             success : true,
             stringResult : report});
}

textCommandProcessor.scripts = function (str) {
	var report = "List of available scripts\n";
	report += Object.keys(dbg.scripts).join("\n");

    return ({commandname : "scripts",
             success : true,
             stringResult : report});
}

textCommandProcessor.step = function (str, frame, script) {
	if (frame) {
		dbg.breakLine = script.getOffsetLine(frame.offset) + 1;
		frame.onStep = function () {
			stepFunction(frame, frame.script);
			return undefined;
		};
		stop = true;
		_unlockVM();

        return ({commandname : "step",
                 success : true,
                 stringResult : ""});
	} else {
        return ({commandname : "step",
                 success : false,
                 stringResult : ""});
    }
}

textCommandProcessor.continue = function (str, frame, script) {
	if (frame) {
		frame.onStep = undefined;
		dbg.breakLine = 0;
	}
	stop = true;
	_unlockVM();

    return ({commandname : "continue",
             success : true,
             stringResult : ""});
}

textCommandProcessor.deval = function (str, frame, script) {
	// debugger eval
	var md = str.match(/^deval\s+(.+)/);
	if (md[1]) {
		try {
			var devalReturn = eval(md[1]);
			if (devalReturn) {
                var stringreport = debugObject(devalReturn, true);
                return ({commandname : "deval",
                         success : true,
                         stringResult : stringreport});
			}
		} catch (e) {
            return ({commandname : "deval",
                     success : false,
                     stringResult : "exception:\n" + e.message});
		}
	} else {
        return ({commandname : "deval",
                 success : false,
                 stringResult : "could not parse script to evaluate"});
    }

}

textCommandProcessor.eval = function (str, frame, script) {
    if (!frame) {
        return ({commandname : "eval",
                 success : false,
                 stringResult : "no frame to eval in"});
    }

    var stringToEval = str.substring(4);

	if (stringToEval) {
        try {
		    var evalResult = frame['eval']("JSON.stringify(eval(" + stringToEval + "));");
		    if (evalResult && evalResult['return']) {
                var stringreport = evalResult['return'];
                // var stringreport = debugObject(evalResult['return']);
                return ({commandname : "eval",
                         success : true,
                         stringResult : stringreport});
            } else if (evalResult && evalResult['throw']) {
                return ({commandname : "eval",
                         success : false,
                         stringResult : "got exception: " + evalResult['throw'].message});
		    } else {
                return ({commandname : "eval",
                         success : false,
                         stringResult : "invalid return from eval"});
		    }
        } catch (e) {
            dbg.log("exception = " + e);
            return ({commandname : "eval",
                     success : false,
                     stringResult : "Exception : " + e});
        }
	}
}

textCommandProcessor.line = function (str, frame, script) {
	if (frame) {
        try {
            return ({commandname : "line",
                     success : true,
                     stringResult : script.getOffsetLine(frame.offset)});
        } catch (e) {
            return ({commandname : "line",
                     success : false,
                     stringResult : "exception " + e});
        }
	}

    return ({commandname : "line",
             success : false,
             // probably entering script
             stringResult : "NOLINE"});
}

textCommandProcessor.backtrace = function (str, frame, script) {
	if (!frame) {
        return ({commandname : "backtrace",
                 success : false,
                 stringResult : "no valid frame"});
    }

    var result = "";
	var cur = frame,
	stack = [cur.script.url + ":" + cur.script.getOffsetLine(cur.offset)];
	while ((cur = cur.older)) {
		stack.push(cur.script.url + ":" + cur.script.getOffsetLine(cur.offset));
	}
	result += stack.join("\n");

    return ({commandname : "backtrace",
             success : true,
             stringResult : result});
}

textCommandProcessor.uiresponse = function (str) {
    var subcommandstring = (str.substring("uiresponse".length)).replace(/\s+/g, '');
    var response = "";
    switch (subcommandstring) {
    case "json":
        dbg.responder = jsonResponder;
        response += "DEBUGGER UI : responding with json messages";
        break;
    case "plaintext":
        dbg.responder = textResponder;
        response += "DEBUGGER UI : responding with plaintext messages";
        break;
    }

    // note : we return an empty string
    // dbg.log(response);
    return ({commandname : "uiresponse",
             success : true,
             stringResult : ""});
}

textCommandProcessor.help = function () {
    _printHelp();

    return ({commandname : "help",
             success : true,
             stringResult : ""});
}

textCommandProcessor.getCommandProcessor = function (str) {
	// break
	var md = str.match(/[a-z]*/);
    if (!md) {
        return null;
    }
    switch (md[0]) {
    case "b" :
    case "break" :
        return textCommandProcessor.break;
    case "info" :
        return textCommandProcessor.info;
    case "clear" :
        return textCommandProcessor.clear;
    case "scripts" :
        return textCommandProcessor.scripts;
    case "s" :
    case "step" :
        return textCommandProcessor.step;
    case "c" :
    case "continue" :
        return textCommandProcessor.continue;
    case "deval" :
        return textCommandProcessor.deval;
    case "eval" :
        return textCommandProcessor.eval;
    case "line" :
        return textCommandProcessor.line;
    case "bt" :
        return textCommandProcessor.backtrace;
    case "uiresponse" :
        return textCommandProcessor.uiresponse;
    case "help" :
        return textCommandProcessor.help;
    default :
        return null;
    }
}

// JSON output
var jsonResponder = {};

jsonResponder.write = function (str) {
    _bufferWrite(str);
    _bufferWrite("\n");
    _bufferWrite(String.fromCharCode(23));
}

jsonResponder.onBreakpoint = function (filename, linenumber) {
    var response = {"from" : "server",
                    "why" : "onBreakpoint",
                    "data" : {"jsfilename" : filename,
                              "linenumber" : linenumber}};

    dbg.log("onBreakpoint: " + JSON.stringify(response));

var breakInfo = { "from":"tabThreadActor111", "type":"paused", "actor":"pauseActor",
   "why":{ "type":"breakpoint", "actors":["breakpointActor1"] },
   "frame":{ "actor":"frameActor", "depth":1,
             "type":"call", "where":{ "url":"sample.js", "line":3 },
             "environment":{ "type":"function", "actor":"gFrameActor",
                             "function":{ "type":"object", "class":"Function", "actor":"gActor" },
                             "functionName":"g",
                             "bindings":{ arguments: [ { "y": { "value":"argument to g", "configurable":"false",
                                                                "writable":true, "enumerable":true } } ] },
                             "parent":{ "type":"function", "actor":"fFrameActor",
                                        "function":{ "type":"object", "class":"Function", "actor":"fActor" },
                                        "functionName":"f",
                                        "bindings": { arguments: [ { "x": { "value":"argument to f", "configurable":"false",
                                                                     "writable":true, "enumerable":true } } ],
                                                      variables: { "z": { "value":"value of z", "configurable":"false",
                                                                          "writable":true, "enumerable":true } } },
                                        "parent":{ "type":"object", "actor":"globalCodeActor",
                                                   "object":{ "type":"object", "class":"Global",
                                                              "actor":"globalObjectActor" }
                                                 }
                                      }
                           },
                        "callee":"gActor", "calleeName":"g",
             "this":{ "type":"object", "class":"Function", "actor":"gActor" },
             "arguments":["argument to g"]
           }
 };

    _RDPWrite(breakInfo);

    //this.write(JSON.stringify(response));
}

jsonResponder.onStep = function (filename, linenumber) {
    var response = {"from" : "server",
                    "why" : "onStep",
                    "data" : {"jsfilename" : filename,
                              "linenumber" : linenumber}};

    this.write(JSON.stringify(response));
}

jsonResponder.commandResponse = function (commandresult) {
    var response = {"from" : "server",
                    "why" : "commandresponse",
                    "data" : commandresult};

    this.write(JSON.stringify(response));
}

jsonResponder.commandNotFound = function () {
    // do nothing
}

// Plain Old Text output
var textResponder = {};

textResponder.write = function (str) {
    _bufferWrite(str);
    _bufferWrite("\n");
    _bufferWrite(String.fromCharCode(23));
}

var breakpointFrame = null;

textResponder.onBreakpoint = function (frame) {//filename, linenumber) {
    // var shortFilename = filename.substring(filename.lastIndexOf("/") + 1);
    // var response = "Breakpoint hit at " + shortFilename + " line number : " + linenumber;
    // dbg.log("textResponder.onBreakpoint:"+response);

    var breakInfo = { "from":"tabThreadActor111", "type":"paused", "actor":"pauseActor",
   "why":{ "type":"breakpoint", "actors":["breakpointActor1"] },
   "frame":{ "actor":"frameActor", "depth":1,
             "type":"call", "where":{ "url":"sample.js", "line":3 },
             "environment":{ "type":"function", "actor":"gFrameActor",
                             "function":{ "type":"object", "class":"Function", "actor":"gActor" },
                             "functionName":"g",
                             "bindings":{ arguments: [ { "y": { "value":"argument to g", "configurable":"false",
                                                                "writable":true, "enumerable":true } } ] },
                             "parent":{ "type":"function", "actor":"fFrameActor",
                                        "function":{ "type":"object", "class":"Function", "actor":"fActor" },
                                        "functionName":"f",
                                        "bindings": { arguments: [ { "x": { "value":"argument to f", "configurable":"false",
                                                                     "writable":true, "enumerable":true } } ],
                                                      variables: { "z": { "value":"value of z", "configurable":"false",
                                                                          "writable":true, "enumerable":true } } },
                                        "parent":{ "type":"object", "actor":"globalCodeActor",
                                                   "object":{ "type":"object", "class":"Global",
                                                              "actor":"globalObjectActor" }
                                                 }
                                      }
                           },
                        "callee":"gActor", "calleeName":"g",
             "this":{ "type":"object", "class":"Function", "actor":"gActor" },
             "arguments":["argument to g"]
           }
 };

    breakpointFrame = frame;
    _RDPWrite(breakInfo);

    // this.write(response);
}

textResponder.onStep = function (filename, linenumber) {
    var shortFilename = filename.substring(filename.lastIndexOf("/") + 1);
    var response = "Stopped at " + shortFilename + " line number : " + linenumber;
    this.write(response);
}

textResponder.commandResponse = function (commandresult) {
    var response = "";

    try {
        switch (commandresult.commandname) {
        case "break" :
            if (!commandresult.success) {
                response += "ERROR : " + commandresult.stringResult;
            }
            break;
        case "info" :
            if (!commandresult.success) {
                response += "ERROR : " + commandresult.stringResult;
            }
            break;
        case "clear" :
            break;
        case "scripts" :
            if (true === commandresult.success) {
                response += commandresult.stringResult;
            }
            break;
        case "step" :
            if (!commandresult.success) {
                response += "ERROR : step failed " + commandresult.stringResult;
            }
            break;
        case "continue" :
            if (!commandresult.success) {
                response += "ERROR : continue failed " + commandresult.stringResult;
            }
            break;
        case "deval" :
            if (true === commandresult.success) {
                response += commandresult.stringResult;
            } else {
                response += "ERROR : deval failed " + commandresult.stringResult;
            } 
            break;
        case "eval" :
            if (true === commandresult.success) {
                response += commandresult.stringResult;
            } else {
                response += "ERROR : eval failed " + commandresult.stringResult;
            } 
            break;
        case "line" :
            if (true === commandresult.success) {
                response += commandresult.stringResult;
            } else {
                response += "ERROR : " + commandresult.stringResult;
            } 
            break;
        case "backtrace" :
            if (true === commandresult.success) {
                response += commandresult.stringResult;
            } else {
                response += "ERROR : " + commandresult.stringResult;
            } 
            break;
        case "help" :
            break;
        }
    } catch (e) {
        response += "\nException logging response " + e;
    }

    this.write(response);
}

textResponder.commandNotFound = function () {
    _printCommandNotFound();
}

var breakpointHandler = {
	hit: function (frame) {
        dbg.log("breakpointHandler hit");
        try {
            dbg.responder.onBreakpoint(frame);//frame.script.url, frame.script.getOffsetLine(frame.offset));
        } catch (e) {
            dbg.log("exception " + e);
        }

		var script = frame.script;
		_lockVM(frame, frame.script);
	}
};

var stepFunction = function (frame, script) {
	if (dbg.breakLine > 0) {
		var curLine = script.getOffsetLine(frame.offset);
		if (curLine < dbg.breakLine) {
			return;
		} else {
            try {
                dbg.responder.onStep(frame.script.url, frame.script.getOffsetLine(frame.offset));
            } catch (e) {
                dbg.log("exception " + e);
            }

			_lockVM(frame, script);
			// dbg.breakLine = 0;
			// frame.onStep = undefined;
		}
	} else {
		dbg.log("invalid state onStep");
	}
};

var debugObject = function (r, isNormal) {
    var stringres = "";
    try {
	    stringres += "* " + (typeof r) + "\n";
	    if (typeof r != "object") {
		    stringres += "~> " + r + "\n";
	    } else {
		    var props;
		    if (isNormal) {
			    props = Object.keys(r);
		    } else {
			    props = r.getOwnPropertyNames();
		    }
		    for (k in props) {
			    var desc = r.getOwnPropertyDescriptor(props[k]);
			    stringres += "~> " + props[k] + " = ";
			    if (desc.value) {
				    stringres += "" + desc.value;
			    } else if (desc.get) {
				    stringres += "" + desc.get();
			    } else {
				    stringres += "undefined (no value or getter)";
			    }
			    stringres += "\n";
		    }
        }

        return stringres;
	} catch (e) {
        return ("Exception when accessing object properties = " + e);
    }
}

dbg.breakLine = 0;

dbg.scriptSourceActorMap = {};



addFiles = function() {
    for (var key in dbg.scripts)
    {
        dbg.log("sources:" + key);
        var scripts = dbg.scripts[key];
        for (var i = 0; i < scripts.length; ++i)
        {
            dbg.log("url:" + scripts[i].source.url);
            dbg.log("-----------");

            dbg.scriptSourceActorMap[key+"_SourceActor"] = scripts[i];

            _RDPWrite(
            {
                from: "tabThreadActor111",
                type: "newSource",
                source: {
                    actor: key+"_SourceActor",
                    url: "file://" + scripts[i].source.url,
                    isBlackBoxed: false
                }
            });
        }
    }
};

addInitialSource = function(sourceActor, script)
{
    _RDPWrite(
    {
        from: sourceActor,
        source: {
             type: "longString",
             initial: script.source.text.substring(0, dbg.LONG_STRING_INITIAL_LENGTH),
             length: script.source.text.length,
             actor: sourceActor+"_LongString"
        }
    });
}

addSource = function(longStringActor, script)
{
    _RDPWrite(
    {
        from: longStringActor,
        substring: script.source.text
    });
}

isStringStartWith = function (str, substring) {
    var reg = new RegExp("^"+substring);
    return reg.test(str);
};

isStringEndsWith = function (str, substring) {
    var reg = new RegExp(substring + "$");
    return reg.test(str);
};

var breakpointActorIndex = 0;

var globalVar = this;

function TestTabActor(aConnection, aGlobal)
{
  this.conn = aConnection;
  this._global = aGlobal;
  this._threadActor = new ThreadActor(this, this._global);
  this.conn.addActor(this._threadActor);
  this._attached = false;
}

TestTabActor.prototype = {
  constructor: TestTabActor,
  actorPrefix: "TestTabActor",

  grip: function() {
    return { actor: this.actorID, title: "Hello Cocos2d-X JSB", url: "http://cocos2d-x.org" };
  },

  onAttach: function(aRequest) {
    this._attached = true;
    return { type: "tabAttached", threadActor: this._threadActor.actorID };
  },

  onDetach: function(aRequest) {
    if (!this._attached) {
      return { "error":"wrongState" };
    }
    return { type: "detached" };
  },

  // Hooks for use by TestTabActors.
  addToParentPool: function(aActor) {
    this.conn.addActor(aActor);
  },

  removeFromParentPool: function(aActor) {
    this.conn.removeActor(aActor);
  }
};

TestTabActor.prototype.requestTypes = {
  "attach": TestTabActor.prototype.onAttach,
  "detach": TestTabActor.prototype.onDetach
};

function TestTabList(aConnection) {
  this.conn = aConnection;

  // An array of actors for each global added with
  // DebuggerServer.addTestGlobal.
  this._tabActors = [];

  // A pool mapping those actors' names to the actors.
  this._tabActorPool = new ActorPool(aConnection);

  // for (let global of gTestGlobals) {
    let actor = new TestTabActor(aConnection, globalDebuggee);
    actor.selected = false;
    this._tabActors.push(actor);
    this._tabActorPool.addActor(actor);
  // }
  if (this._tabActors.length > 0) {
    this._tabActors[0].selected = true;
  }

  aConnection.addActorPool(this._tabActorPool);
}

TestTabList.prototype = {
  constructor: TestTabList,
  iterator: function() {
    for (let actor of this._tabActors) {
      yield actor;
    }
  }
};

this.processInput = function (inputstr, frame, script) {


    var command_func;
    var command_return;
	var commands_array = [];
    var _command;
    var i;

    if (!inputstr) {
        return;
    }

    if (inputstr === "connected")
    {

        DebuggerServer.createRootActor = (conn => {
            return new RootActor(conn, { tabList: new TestTabList(conn) });
        });
        DebuggerServer.init(() => true);
        DebuggerServer.openListener(5086);

        // log("debuggerServer: " + debuggerServer);
        // log("onSocketAccepted: " + debuggerServer.onSocketAccepted);

        if (debuggerServer && debuggerServer.onSocketAccepted)
        {
            var aTransport = {
                host: "127.0.0.1",
                port: 5086,
                openInputStream: function() {
                    return {
                        close: function(){}
                    };
                },
                openOutputStream: function() {
                    return {
                        close: function(){},
                        write: function(){},
                        asyncWait: function(){}
                    };
                },
            };

            debuggerServer.onSocketAccepted(null, aTransport);
        }
        return;
    }

    if (DebuggerServer && DebuggerServer._transport && DebuggerServer._transport.onDataAvailable)
    {
        DebuggerServer._transport.onDataAvailable(inputstr);
    }

    return;

//     var testStr = "104:{\
//   \"to\": \"tabThreadActor111\",\
//   \"type\": \"resume\",\
//   \"resumeLimit\": null,\
//   \"pauseOnExceptions\": false\
// }60:{\
//   \"to\": \"ActionsTest.js_SourceActor\",\
//   \"type\": \"source\"\
// }";

    // for (var i = 0; i < testArr.length; ++i)
    // {
    //     dbg.log("split: " +"{"+ testArr[i] + ",length= "+testArr.length);
    // }

    var inputArr = inputstr.split(/\d+:{/g);

    if (inputArr.length > 1)
    {
        inputArr.shift();
        for (var i = 0; i < inputArr.length; ++i) {
            // dbg.log("---> "+inputArr[i]);
            processInput("{"+inputArr[i], frame, script);
        }
        return;
    }

    // dbg.log("inputStr:"+inputstr);

    if (inputstr === "connected")
    {
        var rootInit = {from:"root",applicationType:"browser",traits:{sources: true}};
        _RDPWrite(rootInit);
        return;
    }

    // var semi = inputstr.indexOf(":");

    // if (semi === -1)
    // {
    //     dbg.log("wrong input remote debugger protocol string.");
    //     return;
    // }

    var jsonStr = inputstr;//.substring(semi+1);
    dbg.log("jsonStr:" + jsonStr);
    var jsonObj = JSON.parse(jsonStr);
    // for (var key in jsonObj)
    // {
    //     dbg.log("["+key+"]="+jsonObj[key]);
    // }

    if (jsonObj.to === "root" && jsonObj.type === "listTabs")
    {
        _RDPWrite({ from:"root", tabs:[{ actor:"JSBTabActor", title:"Hello cocos2d-x JSB", url:"http://www.cocos2d-x.org" }], selected:0 });
    }
    else if (jsonObj.to === "JSBTabActor" && jsonObj.type === "attach")
    {
        _RDPWrite({ from:"JSBTabActor", type:"tabAttached", threadActor:"tabThreadActor111" });
    }
    else if (jsonObj.to === "tabThreadActor111" && jsonObj.type === "attach")
    {
        _RDPWrite(
        {
            from: "tabThreadActor111",
            type: "paused",
            actor: "JSBTabActor",
            poppedFrames: [],
            why: {
                type: "attached"
            }
        });
    }
    else if (jsonObj.to === "tabThreadActor111" && jsonObj.type === "sources")
    {
        addFiles();
    }
    else if (jsonObj.to && isStringEndsWith(jsonObj.to, "_SourceActor") && jsonObj.type === "source")
    {
        dbg.log("require source ...: " + jsonObj.to);
        var script = dbg.scriptSourceActorMap[jsonObj.to];

        if (script)
        {
            addInitialSource(jsonObj.to, script);
        }
    }
    else if (jsonObj.to && isStringEndsWith(jsonObj.to, "_LongString") && jsonObj.type === "substring")
    {
        var sourceActor = jsonObj.to.substring(0, jsonObj.to.length-"_LongString".length);
        dbg.log("source actor: " + sourceActor);
        var script = dbg.scriptSourceActorMap[sourceActor];

        if (script)
        {
            addSource(jsonObj.to, script);
        }

        _RDPWrite({
            from: "tabThreadActor111",
            type: "resumed"
        });
    }
    else if (jsonObj.to === "tabThreadActor111" && jsonObj.type === "resume")
    {
        dbg.log("resume type to server....");
        _RDPWrite({
            from: "tabThreadActor111",
            type: "resumed"
        });
    }
    else if (jsonObj.to === "tabThreadActor111" && jsonObj.type === "setBreakpoint")
    {
        ++breakpointActorIndex;

        var scripts = dbg.scripts[jsonObj.location.url],
        tmpScript = null;

        if (scripts) {
            var breakLine = jsonObj.location.line,
            off = -1;
            for (var n=0; n < scripts.length; n++) {
                offsets = scripts[n].getLineOffsets(breakLine);
                if (offsets.length > 0) {
                    off = offsets[0];
                    tmpScript = scripts[n];
                    break;
                }
            }
            if (off >= 0) {
                tmpScript.setBreakpoint(off, breakpointHandler);
                // return ({commandname : "break",
                //          success : true,
                //          jsfilename : md[2],
                //          breakpointlinenumber : breakLine});
            } else {
                // return ({commandname : "break",
                //          success : false,
                //          stringResult : "no valid offsets at that line"});
            }
        } else {
            // return ({commandname : "break",
            //          success : false,
            //          jsfilename : md[2],
            //          stringResult : "Invalid script name"});
        }

        _RDPWrite({ from: "tabThreadActor111", "actor":"breakpointActor"+breakpointActorIndex});
        // jsonObj.location.url
        // jsonObj.location.line
    }
    else if (isStringStartWith(jsonObj.to, "breakpointActor") && jsonObj.type === "delete")
    {
        _RDPWrite({ from: jsonObj.to });
    }
    else if (jsonObj.to === "tabThreadActor111" && jsonObj.type === "frames")
    {
        dbg.log("sdfsld...."+breakpointFrame.arguments);

    // var arr = breakpointFrame.getOwnPropertyNames();
    // log("names: "+ arr);

    var parentEnv = breakpointFrame.environment.parent;
    log("parentEnv:" + parentEnv);
    log("parentEnv.type:" + parentEnv.type);
    log("parentEnv.actor:" + parentEnv.actor);
    log("parentEnv.functionName:" + parentEnv.functionName);
    log("parentEnv.object:" + parentEnv.object);
    log("parentEnv.object.type:" + parentEnv.object.type);
    log("parentEnv.object.class:" + parentEnv.object.class);
    var keys = Object.keys(parentEnv.object);
    log("keys: " + keys);

    parentEnv = parentEnv.parent;
    log("2parentEnv:" + parentEnv);
    log("parentEnv.type:" + parentEnv.type);
    log("parentEnv.actor:" + parentEnv.actor);
    log("parentEnv.functionName:" + parentEnv.functionName);

    var bindings = parentEnv.bindings;
    log("bindings:" + bindings);

    var args = bindings.arguments;
    log("args:"+args);

    var vars = bindings.variables;
    log("vars:" + vars);

        // if (breakpointFrame != null)
        {
            dbg.log("get frames.....");
            var obj =    {
                "from": "tabThreadActor111",
                "frame":{ "actor":"frameActor", "depth":1,
             "type":"call", "where":{ "url":"sample.js", "line":3 },
             "environment":{ "type":"function", "actor":"gFrameActor",
                             "function":{ "type":"object", "class":"Function", "actor":"gActor" },
                             "functionName":"g",
                             "bindings":{ arguments: [ { "y": { "value":"argument to g", "configurable":"false",
                                                                "writable":true, "enumerable":true } } ] },
                             "parent":{ "type":"function", "actor":"fFrameActor",
                                        "function":{ "type":"object", "class":"Function", "actor":"fActor" },
                                        "functionName":"f",
                                        "bindings": { arguments: [ { "x": { "value":"argument to f", "configurable":"false",
                                                                     "writable":true, "enumerable":true } } ],
                                                      variables: { "z": { "value":"value of z", "configurable":"false",
                                                                          "writable":true, "enumerable":true } } },
                                        "parent":{ "type":"object", "actor":"globalCodeActor",
                                                   "object":{ "type":"object", "class":"Global",
                                                              "actor":"globalObjectActor" }
                                                 }
                                      }
                           },
                        "callee":"gActor", "calleeName":"g",
             "this":{ "type":"object", "class":"Function", "actor":"gActor" },
             "arguments":["argument to g"]
           }};

            _RDPWrite(obj);

            breakpointFrame = null;
        }
    }
    else if (jsonObj.type === "interrupt")
    {
        _RDPWrite({
            from: "tabThreadActor111",
            type: "resumed"
        });
    }



    return;
    // remove Carriage Return's
	inputstr = inputstr.replace(/\r+/, "");

    // split into an array using Line Feed as the delimiter
    commands_array = inputstr.split("\n");

    // trace the commands received
    // dbg.log("received " + commands_array.length + " commands:");
    // for (i = 0; i < commands_array.length; i++) {
    //     if (i in commands_array) {
    //         dbg.log("~~~ commandstring =" + commands_array[i]);
    //         dbg.log("    commandstring.length = " + commands_array[i].length);
    //     }
    // }

    for (i = 0; i < commands_array.length; i++) {
        if (i in commands_array) {
            _command = commands_array[i];

	        if (_command === "") {
                // dbg.log("Empty input. Ignoring.");
	        } else {
                // dbg.log(_command);

                command_func = dbg.getCommandProcessor(_command);

                if (!command_func) {
                    dbg.log("did not find a command processor!");
                    dbg.responder.commandNotFound();
                } else {
                    try {
                        command_return = command_func(_command, frame, script);
                        if (true === command_return.success) {
                            dbg.responder.commandResponse(command_return);
                        } else {
                            dbg.log("command failed. return value = " + command_return.stringResult);
                            dbg.responder.commandResponse(command_return);
                        }
                    } catch (e) {
                        dbg.log("Exception in command processing. e =\n" + e  + "\n");
                        var _output = {success : false,
                                       commandname : command_func.name,
                                       stringResult : e};
                        dbg.responder.commandResponse(_output);
                    }
                }
            }
        }
    }
};

_printCommandNotFound = function() {
	var str = "ERROR : command not found!\n";
	_bufferWrite(str);
};

_printHelp = function() {
	var help = "break filename:numer\tAdds a breakpoint at a given filename and line number\n" +
		"clear\tClear all breakpoints\n" +
		"c / continue\tContinues the execution\n" +
		"s / step\tStep\n" +
		"bt\tBacktrace\n" +
		"scripts\tShow the scripts\n" +
		"line\tShows current line\n" +
		"eval js_command\tEvaluates JS code\n" +
		"deval js_command\tEvaluates JS Debugger command\n" +
		"uiresponse [json|plaintext] Switch between JSON and plaintext output from the debugger\n";
	_bufferWrite(help);
};

dbg.scripts = [];

_RDPWrite = function(jsonObj){
    var buf = JSON.stringify(jsonObj);
    _bufferWrite("" + buf.length + ":" + buf);
};

dbg.onNewScript = function (script) {
    dbg.log("onNewScript, "+script.url);
	// skip if the url is this script
	// var last = script.url.split("/").pop();

	var children = script.getChildScripts(),
	arr = [script].concat(children);
	/**
	 * just dumping all the offsets from the scripts
	 for (var i in arr) {
	 dbg.log("script: " + arr[i].url);
	 for (var start=arr[i].startLine, j=start; j < start+arr[i].lineCount; j++) {
	 var offsets = arr[i].getLineOffsets(j);
	 dbg.log("  off: " + offsets.join(",") + "; line: " + j);
	 }
	 }*/
	
	dbg.scripts["file://"+script.url] = arr;

    // dbg.log("source: "+script.source.text);


};

dbg.onError = function (frame, report) {
	if (dbg.socket && report) {
		_socketWrite(dbg.socket, "!! exception @ " + report.file + ":" + report.line);
	}
	dbg.log("!! exception");
};

dbg.onDebuggerStatement = function(frame)
{
    dbg.log("onDebuggerStatement...");
};

this._prepareDebugger = function (global) {

    globalDebuggee = global;
	// var tmp = new Debugger(global);
	// tmp.onNewScript = dbg.onNewScript;
	// tmp.onDebuggerStatement = dbg.onDebuggerStatement;
	// tmp.onError = dbg.onError;
	// dbg.dbg = tmp;

 //    // use the text command processor at startup
 //    dbg.getCommandProcessor = textCommandProcessor.getCommandProcessor;

 //    // use the text responder at startup
 //    dbg.responder = textResponder;
};

this._startDebugger = function (global, files, startFunc) {
	// dbg.log("[DBG] starting debug session");
	for (var i in files) {
		try {
			global['eval']("require('" + files[i] + "');");
		} catch (e) {
			dbg.log("[DBG] error evaluating file: " + files[i]);
		}
	}
	// dbg.log("[DBG] all files required");
	if (startFunc) {
		// dbg.log("executing start func: " + startFunc);
		global['eval'](startFunc);
	}
	// beginDebug();
}
