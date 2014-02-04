// WhiskChat bot

String.prototype.chunk = function(size) {
    return [].concat.apply([], this.split('').map(function(x, i) {
        return i % size ? [] : this.slice(i, i + size)
    }, this))
}
var io = require("socket.io-client");
var started = false;
var random = require("random");
var youtube = require('youtube-feeds');
var users = [];
var chatBuffer = [];
var redis = require('redis');
var chance = 60;
var db = redis.createClient(9891, 'squawfish.redistogo.com', {
    no_ready_check: true
});
var dbready = false;
var edge = 0.915; // 9.5% house edge.
var payout = 1.4;
var username = 'botgames';
var qlist = "";
var qgame = false;
var qboss = 'Game not in progress';
var tippedProfit = true;
var toproom = 'botgames';
var shutdown = false;
var lastWinner = null;
var socket = io.connect("http://server.whiskchat.com/");
console.log('[WDB] Initializing WhiskDiceBot!');
console.log('[WDB] Connecting to WhiskChat...');
socket.on("connect", function() {
    console.log('[WDB] Connected to WhiskChat. Logging in...');
    socket.emit("accounts", {
        action: "login",
        username: 'WhiskDiceBot',
        password: process.env.whiskbotpass
    });
    socket.on("loggedin", function(data) {
        socket.emit('chat', {
            room: 'main',
            message: '!; connect WhiskDiceBot/whiskers75 - play in #botgames'
        });
        console.log('[WDB] Logged in');
        var username = data.username;
	socket.on('online', function(data) {
	    if (data.array) {
		users = data.array;
	    }
	});
        socket.emit("getbalance", {});
	db.auth(process.env.whiskredispass, function(err, res) {
            if (err) {
                console.log("[WDB] Error connecting to database! " + err);
                chat("botgames", "✗ Error connecting to database! " + err, "e00");
                shutdown = true;
            } else {
                started = true;
                db.incr('startups', function(err, res) {
                    if (err) {
                        dbraise(err)
                    } else {
                        chat('botgames', '✔ ' + username + '/betting initialized! (!help for info, total boots: ' + res + ')', "090");
                        started = true;
                        console.log('[WDB] WhiskDiceBot initialized!');
                    }
                });
            }
        });
    });
    socket.on("message", function(msg) {
        console.log('[WhiskChat] ' + msg.message)
    });
    
    function yell(type, code, string) {
        console.log("[WDB] RANDOM.ORG Error: Type: " + type + ", Status Code: " + code + ", Response Data: " + string);
        chat("botgames", "RANDOM.ORG Error: Type: " + type + ", Status Code: " + code + ", Response Data: " + string, "e00");
    }
    
    function chat(room, msg, color) {
        chatBuffer.push({
            room: room,
            message: "[color=#" + color + "]" + msg + "[/color]",
            color: color
        });
    }
    
    function pm(user, msg, color) {
        chatBuffer.push({
            room: 'WhiskDiceBot:' + user.toLowerCase(),
            message: msg,
            color: color
        });
    }
    
    function tip(obj) {
        chatBuffer.push({
            tipobj: obj
        });
    }
    setInterval(function() {
        if (chatBuffer[0]) {
            if (chatBuffer[0].tipobj) {
                socket.emit("tip", chatBuffer[0].tipobj);
            } else {
                socket.emit("chat", chatBuffer[0]);
            }
            chatBuffer.splice(0, 1);
        } else {
            if (shutdown) {
                console.log('[WDB] Shutting down...');
                process.exit(0);
            }
        }
    }, 500);
    
    function stripHTML(html) {
        return html.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>?/gi, '');
    }
    
    function parseTip(data) {
        if (data.target == 'WhiskDiceBot') {
            // We got a tip!
            if (typeof data.message === "undefined") {
                data.message = "";
            }
            if (data.message == 'donation') {
                chat('botgames', 'Thanks for the donation!', '090')
                return null;
            }
            try {
                data.tipmessage = Number(data.message.substring(data.message.indexOf('%') - 3, data.message.indexOf('%')));
                if (data.tipmessage > 0 && data.tipmessage < 76) {
                    // Recognised valid percentage.
                    data.chance = data.tipmessage;
                    data.payout = Number((edge / (data.tipmessage / 100)).toFixed(2));
                } else {
                    data.tipmessage = Number(data.message.substring(data.message.indexOf('%') - 2, data.message.indexOf('%')));
                    if (data.tipmessage > 0 && data.tipmessage < 76) {
                        // It's something like 1%... grr - but still valid
                        data.chance = data.tipmessage;
                        data.payout = Number((edge / (data.tipmessage / 100)).toFixed(2));
                    } else {
                        data.chance = 25;
                        data.payout = Number((edge / (data.chance / 100)).toFixed(2));
                    }
                }
            } catch (e) {
                data.chance = 25;
                data.payout = Number((edge / (data.chance / 100)).toFixed(2));
            }
            data.tipAmount = data.amount;
            // Is this bet gonna work?
            data.winAmount = data.tipAmount * data.payout
            data.winTip = (data.tipAmount * data.payout)
            if (started && balance > data.winAmount && 20 > data.winAmount && 10.00001 > data.tipAmount) {
                data.valid = true;
            } else {
                data.valid = false;
            }
            return data;
        } else {
            // No, return null
            return null;
        }
    }
    socket.on("tip", function(data) {
        data.parsedTip = parseTip(data);
        if (data.parsedTip) {
            if (data.parsedTip && data.room === 'botgames' && data.parsedTip.valid) {
                random.generateIntegers(function(integ) {
                    data.rand = integ[0][0];
                    if (data.rand < (data.parsedTip.chance + 1)) {
                        tip({
                            user: data.user,
                            room: 'botgames',
                            tip: data.parsedTip.winTip
                        });
                        db.set('lastwinner', data.user, redis.print);
                        db.get('winnings/' + data.user, function(err, res) {
                            if (err) {
                                dbraise(err)
                            } else {
                                db.set('winnings/' + data.user, Number(res) + data.parsedTip.winTip, redis.print)
                                chat('botgames', '✔ [b]' + data.user + '[/b] won [b]' + data.parsedTip.winTip + '[/b] mBTC! :) (History: ' + (Number(res) + data.parsedTip.winTip).toFixed(2) + ' mBTC) [' + data.parsedTip.chance + '%, ' + data.parsedTip.payout + 'x: ' + data.rand + " < " + (data.parsedTip.chance + 1) + ']', "090");
                            }
                        });
                        lastWinner = data.user;
			
                    } else {
                        db.get('winnings/' + data.user, function(err, res) {
                            if (err) {
                                dbraise(err)
                            } else {
                                data.lost = Number(data.message.substring(58, data.message.indexOf('mBTC')));
                                db.set('winnings/' + data.user, Number(res) - data.parsedTip.tipAmount, redis.print);
                                chat('botgames', '✗ [b]' + data.user + '[/b] lost [b]' + data.parsedTip.tipAmount + '[/b] mBTC! :( (History: ' + (Number(res) - data.parsedTip.tipAmount).toFixed(2) + ' mBTC) [' + data.parsedTip.chance + '%, ' + data.parsedTip.payout + 'x: ' + data.rand + " < " + (data.parsedTip.chance + 1) + ']', "e00");
                            }
                        });
                        db.get('lastwinner', function(err, lastWinner) {
                            if (err) {
                                dbraise(err)
                            } else {
                                if ((data.rand > 85) && lastWinner && (data.message.substring(58, data.message.indexOf('mBTC') - 1) > 0.49) && (balance > 17)) {
                                    totip = String(data.message.substring(58, data.message.indexOf('mBTC') - 1) * 0.5);
                                    tip({
                                        user: lastWinner,
                                        room: 'botgames',
                                        tip: totip
                                    });
                                    db.get('winnings/' + data.user, function(err, res) {
                                        if (err) {
                                            dbraise(err)
                                        } else {
                                            db.set('winnings/' + data.user, Number(res) + Number(totip * 0.98), redis.print)
                                            chat('botgames', '✔ ' + lastWinner + ' won ' + (totip * 0.98) + ' mBTC! :) (' ((Number(res) + Number(totip)) * 0.98).toFixed(2) + ') [last winner bonus]', "090");
                                        }
                                    });
                                }
                            }
                        });
                    };
                }, {
                    secure: true,
                    num: 1,
                    min: 1,
                    max: 100
                }, yell);
		
                socket.emit("getbalance", {});
            } else {
                chat('botgames', '[b]There was an error with your bet! (max bet exceeded, bot balance low, game not enabled)[/b]', "e00");
                totip = String(data.parsedTip.tipAmount);
                tip({
                    user: data.user,
                    room: 'botgames',
                    tip: totip,
                    message: 'Exceeds balance!'
                });
            }
        }
    });
    setTimeout(function() {
        socket.on("chat", function(data) {
            data.parsedTip = parseTip(data.message)
            console.log('[Chat] ' + data.user + ': ' + stripHTML(data.message) + ' (' + data.room + ', ' + JSON.stringify(data.parsedTip) + ')');
            if (data.message === "!start" && data.room === "botgames" && (data.user === "whiskers75" || data.user === "admin")) {
                chat('botgames', 'Initializing WhiskDice game (!help for info)', "e00");
                socket.emit("getbalance", {});
                started = true;
		
            }
            if (data.message === "!stop" && data.room === "botgames" && (data.user === "whiskers75" || data.user === "admin")) {
                chat('botgames', 'Stopping WhiskDice game (!help for info)', "e00");
                socket.emit("getbalance", {});
                started = false;
		
            }
            if (data.message === "!shutdown" && data.room === "botgames" && (data.user === "whiskers75" || data.user === "admin")) {
                chat('botgames', '✗ Bot powering off. No more bets until the bot is started.', "e00");
                shutdown = true;
            }
            if (data.message.substring(0, 4) === "!get" && data.room === "botgames" && (data.user === "whiskers75" || data.user === "snoopah")) {
                tip({
                    user: data.user,
                    room: 'botgames',
                    tip: data.message.split(' ')[1]
                });
            }
            if (data.message === "!lastwinner" && data.room === "botgames") {
                db.get('lastwinner', function(err, lastWinner) {
                    if (err) {
                        dbraise(err)
                    } else {
                        chat('botgames', 'Last winner: ' + lastWinner, "090");
                    }
                });
            }
            if (data.message === "!quota" && data.room === "botgames") {
                random.checkQuota(function(quota) {
                    chat("botgames", "RANDOM.ORG Bits Remaining: " + quota, "090");
                }, {}, yell);
            }
            if (data.message.substr(0, 6) === "!users" && data.room === "botgames") {
                var toproom = data.message.substr(7, data.message.length);
                socket.emit('toprooms', {});
            }
            if (data.message === "!history" && data.room === "botgames") {
                db.get('winnings/' + data.user, function(err, res) {
                    if (err) {
                        dbraise(err);
                    } else {
                        if (res == null) {
                            chat('botgames', 'No information available!', '090');
                        } else {
                            if (res > 0 || res == 0) {
                                chat('botgames', 'Overall profit for ' + data.user + ': ' + Number(res).toFixed(2), '090');
                            }
                            if (res < 0) {
                                chat('botgames', 'Overall loss for ' + data.user + ': ' + Number(res).toFixed(2), 'e00');
                            }
                        }
                    }
                });
            }
            if (data.message === "!bots" && data.room === "botgames") {
                db.get('!bots', function(err, res) {
                    if (err) {
                        dbraise(err);
                    } else {
                        if (res == null) {
                            chat('botgames', 'No information available!', '090');
                        } else {
                            var tmp = res.chunk(200);
                            tmp.forEach(function(chunk) {
                                chat('botgames', chunk, '090');
                            });
                        }
                    }
                });
            }
            if (data.message.split(' ')[0] === "!newgame" && data.room === "20questions" && !qgame) {
                qlist = '';
                alist = '';
                chat('main', '[b]New game of 20 Questions starting! Join #20questions to play with ' + data.user + '![/b]', "090");
                chat('20questions', '' + data.user + ': choose a word! You have 30 seconds until the game starts.', '090');
                qboss = data.user;
                setTimeout(function() {
                    chat('20questions', 'Game started! Begin guessing!', '090');
                    qgame = true;
                }, 30000);
            }
            if (data.message === "!hints" && data.room === "20questions" && qgame) {
                var tmp = ("Hints: " + qlist).chunk(200);
                tmp.forEach(function(chunk) {
                    chat('20questions', chunk, '090');
                });
            }
            if (data.message === "!ahints" && data.room === "20questions" && qgame) {
                var tmp = ("Antihints: " + alist).chunk(200);
                tmp.forEach(function(chunk) {
                    chat('20questions', chunk, 'e00');
                });
            }
            if (data.message === "!help" && data.room === "20questions") {
                chat('20questions', 'Commands: !newgame (start new game) | !(a)hints (get (anti)hints) | !(a)hint <hint> (add (anti)hint) | !winner <winner> (finish game, and announce winner) | !state (check state)', '090');
            }
            if (data.message === "!state" && data.room === "20questions") {
                chat('20questions', 'Game on: ' + qgame + ' | Word master: ' + qboss, '090');
            }
            if (data.message.split(' ')[0] === "!winner" && data.room === "20questions" && qgame) {
                qlist = '';
                qgame = false;
                qboss = 'Game not in progress';
                chat('20questions', 'The game of 20 Questions has ended! Winner: ' + data.message.split(' ')[1], "e00");
            }
            if (data.message.split(' ')[0] === "!hint" && data.room === "20questions" && qgame && data.user === qboss) {
                var tmp = data.message.split(' ');
                tmp.shift();
                var tmp = tmp.join(' ');
                qlist += ' ' + tmp + ' | ';
                chat('20questions', '✔ ' + tmp, "090");
            }
            if (data.message.split(' ')[0] === "!ahint" && data.room === "20questions" && qgame && data.user === qboss) {
                var tmp = data.message.split(' ');
                tmp.shift();
                var tmp = tmp.join(' ');
                alist += ' ✗ ' + tmp + ' | ';
                chat('20questions', '✗ ' + tmp, "e00");
            }
            if (data.message.split(' ')[0] === "!youtube") {
                youtube.feeds.videos({
                    q: data.message.split(' ').splice(0, 1).join(' '),
                    key: process.env.YT_KEY
                },
				     function(err, res) {
					 chat('botgames', 'YouTube: ' + res.items[1].uploader + ': ' + res.items[1].title + ' - ' + res.items[1].player['default'], '090');
				     }
				    );
            }
            if (data.message === "!help" && data.room === "botgames") {
                chat('botgames', '[b]To play WhiskDice (SatoshiDice), check !state, then tip this bot![/b]', "090");
                chat('botgames', 'How to tip: /tip ' + username + ' (amount) (percentage, max 75%)', "090");
                chat('botgames', 'This version was ported for WhiskChat.', "090");
                socket.emit("getbalance", {});
		
            }
            //Does this work?
            //This segment needs to be double checked for functionality. 
            if(contains(data.message, ["<span class='label label-success'>has tipped " + username, "donation"])){
               outputBuffer.push({room: data.room, color: "000", message: "Thank you for the tip, " + data.user + "!"})
            }
            if (data.message === "!commands" && data.room === "botgames") {
                chat('botgames', '[b]Commands: !help, !state, !history (check bet history), !bots (get info on running bots)[/b]', "090");
                socket.emit("getbalance", {});
		
            }
	    
            if (data.message === "!state" && data.room === "botgames") {
                socket.emit("getbalance", {});
                if (started) {
                    setTimeout(function() {
                        chat('botgames', 'Game enabled! Balance: ' + balance.toFixed(2) + ' mBTC | House edge: ' + ((1 - edge) * 100).toFixed(2) + '% | Max bet: 1 mBTC | Max percentage: 75%', "090");
                    }, 2000); // Wait for getbalance
                } else {
                    chat('botgames', 'Game disabled. [b]Don\'t bet![/b]', "e00");
                }
		
            }
	    
        });
    }, 3000); // Make sure we don't answer any previous stuff!
    var balance = 0;
    
    
    socket.on("balance", function(data) {
        if (data.change) {
            balance = balance + data.change;
        } else {
            balance = Number(data.balance);
        }
        console.log('NEW BALANCE: ' + balance);
    });
    
    socket.on('disconnect', function() {
        chat('botgames', '✗ WhiskDiceBot lost connection! Rebooting!', "e00");
        console.log('[WDB] Connection lost. Reconnecting...');
        process.exit(1);
    });
    
    function dbraise(err) {
        console.log("[WDB] Error performing DB operation! " + err);
        chat("botgames", "✗ Error performing DB operation! " + err, "e00");
        chat("botgames", "We are sorry for any inconvenience. If you lost money, take a screenshot and PM whiskers75.", "e00");
    };
    process.on('SIGTERM', function() {
        console.log('[WDB] Recieved SIGTERM, shutting down...');
        chat('botgames', '✗ Bot powering off. No more bets until the bot is started.', "e00");
        shutdown = true;
    });
    process.on('uncaughtException', function(err) {
        console.log('[WDB] Fatal error! ' + err + ' Stacktrace: ' + err.stack);
        chat('botgames', '✗ Fatal error! ' + err, "e00");
        shutdown = true;
    });
});
socket.on('error', function(err) {
    console.log('Failed to start');
    console.log(err);
    process.exit(1);
});
