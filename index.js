#!/usr/bin/env node

const { Client } = require('tdl')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('config.json')
const db = low(adapter)
const ircdkit = require('ircdkit')
const tr = require('transliteration').transliterate

var messages = {}

db.defaults({
	ircd: {
		host: '',
		port: '6667',
		user: '',
		pass: '',
		autojoin: true
	},
	tg: {
		apiId: 1234,
		apiHash: 'xxxx',
		phoneNumber: '+1234'
	},
	chats: {},
	users: {}
}).write()

async function main() {
	const client = new Client({
		apiId: db.get('tg.apiId').value(),
		apiHash: db.get('tg.apiHash').value(),
		loginDetails: {
			phoneNumber: db.get('tg.phoneNumber').value()
		}
	})

	client.on('update', update => {
		if(update._ == 'updateNewMessage') {
			if(update.message.content._ == 'messageText') {
				updateNewMessage(update.message)
			}
		} else if(update._ == 'updateMessageSendSucceeded') {
			if(update.message.content._ == 'messageText') {
				updateMessageSendSucceeded(update.message)
			}
		} else if(update._ == 'updateUser') {
			updateUser(update.user)
		}
		console.log('Got update:', JSON.stringify(update, null, 2))
	}).on('error', err => {
		console.error('Got error:', JSON.stringify(err, null, 2))
	})

	await client.connect()

	async function getChats() {
		const ids = await client.invoke({
			_: 'getChats',
			offset_order: '9223372036854775807',
			offset_chat_id: 0,
			limit: 100
		})
		let chats = []
		await Promise.all(ids.chat_ids.map(async (chat_id) => {
			await client.invoke({
				_: 'getChat',
				chat_id: chat_id
			}).then(newChat => {
				let channel = '#'+cleanNick(newChat.title)
				if(!getChat(channel)) {
					db.set('chats.'+newChat.id, channel).write()
				}
			})
		}))
	}
	if(db.get('ircd.autojoin').value()) {
		getChats()
	}

	async function updateUser(user) {
		log(`User ${user.id} is ${user.username} (${user.first_name} ${user.last_name})`)
		var newUser = {
			nick: cleanNick(user.username ? user.username : user.first_name + user.last_name ),
			realName: (user.first_name+' '+user.last_name).trim(),
			userName: cleanUserName(user.first_name+user.last_name)
		}
		db.set('users.'+user.id, newUser).write()
	}

	async function updateNewMessage(message) {
		if(message.content._ != 'messageText' || message.content.text._ != 'formattedText' || messages[message.id]) return
		var reply = ''
		if(message.reply_to_message_id && messages[message.reply_to_message_id]) {
			let original = messages[message.reply_to_message_id]
			let reply_text = original.content.text.text
			if(reply_text.length > 15) reply_text = reply_text.substr(0,15)+'…'
			reply = '⎡'+getNick(original.sender_user_id)+': '+reply_text+'⎦ '
		}
		messages[message.id] = message
		message.replybox = reply
		if(message.sending_state && message.sending_state._ == 'messageSendingStatePending') return
		ircdmsg(message)
	}

	async function updateMessageSendSucceeded(message) {
		if(message.content._ != 'messageText' || message.content.text._ != 'formattedText' || messages[message.id]) return
		messages[message.id] = message
	}

	const irc = ircdkit({
		requireNickname: true,
		maxNickLength: 32,
		validateAuthentication: function (connection, username, accept, reject, waitForPass) {
			if(!db.get('ircd.user').value() || !db.get('ircd.pass').value()) {
				accept()
			}
			if(db.get('ircd.user').value() != username) {
				reject('Invalid login')
			}
			waitForPass(function (password) {
				if(db.get('ircd.pass').value() != password) {
					reject('Invalid login')
				} else {
					accept()
				}
			})
		}
	})

	irc.listen(db.get('ircd.port').value(), db.get('ircd.host').value(), function () {
		log(`Ircd is listening on ${db.get('ircd.host').value()}:${db.get('ircd.port').value()}`)
	})

	irc.on('error', function(error) {
		log('irc error', error)
	})

	irc.on('connection', function(con) {
		con.on('authenticated', function() {
			log(con.mask + " has logged in on connection " + con.id)
		})
		con.on('disconnected', function() {
			log(con.mask + " has disconnected.")
		})
		con.on('error', function(error) {
			log('connection error', con.mask, error)
		})
		con.on('PING', function(target) {
			con.send('PONG '+target)
		})
		con.on('JOIN', function(channel, pass = '') {
			log(`JOIN ${channel} ${pass}`)
			if(!channel) return
			channel = channel.split(',')
			pass = pass.split(',')
			for(let i = 0; i < channel.length; i++) {
				if(!pass[i] && !getChat(channel[i])) {
					con.send(`475 ${getIrcdNick()} ${channel[i]} :Unknown channel, join with JOIN #channel [numeric_chatId]`)
					return
				}
				if(parseInt(pass[i])) {
					setChannel(channel[i], pass[i])
				}
				con.send(getIrcdMask()+' JOIN :'+channel[i])
			}
		})
		con.on('PART', function(channel, reason) {
			log(`PART ${channel} ${reason}`)
			let chat = getChat(channel)
			if(chat) {
				db.unset('chats.'+chat).write()
			}
			con.send(getIrcdMask()+' PART '+channel+' :'+reason)
		})
		con.on('PRIVMSG', function(channel, message) {
			let chat = getChat(channel)
	   		if(chat) {
				telemsg(chat, message)
	   		}
		})
		con.on('WHOIS', function(nick) {
			let user = getChat(nick)
			let userName = getUserName(user)
			let realName = getRealName(user)
			con.send(`:telegram 311 ${getIrcdNick()} ${nick} ${user} ${userName} * :${realName}`)
		})
		con.on('LIST', async function() {
			const ids = await client.invoke({
				_: 'getChats',
				offset_order: '9223372036854775807',
				offset_chat_id: 0,
				limit: 100
			})
			let chats = []
			await Promise.all(ids.chat_ids.map(async (chat_id) => {
				await client.invoke({
					_: 'getChat',
					chat_id: chat_id
				}).then(newChat => {
					chats.push(newChat)
				})
			}))
			for(let chat of chats) {
				let channel = '#'+cleanNick(chat.title)
				con.send(`:telegram 322 ${getIrcdNick()} ${channel} ${chat.unread_count} :${chat.id}`)
			}
			con.send(`:telegram 323 ${getIrcdNick()} :End of channel list`)
		})
	})

	function log(...msg) {
		console.log(...msg)
	}

	function getChat(channel) {
		if(channel.match(/^#/)) {
			let chats = db.get('chats').value()
			for(let chat of Object.keys(chats)) {
				if(chats[chat].toLowerCase() == channel.toLowerCase()) {
					return chat
				}
			}
		} else {
			let users = db.get('users').value()
			for(let user of Object.keys(users)) {
				if(users[user].nick.toLowerCase() == channel.toLowerCase()) {
					return user
				}
			}		
		}
		return undefined
	}

	function cleanNick(nick) {
		nick = tr(nick)
		nick = nick.replace(/[^A-Za-z0-9\-_\^`|]/g, '');
		return nick
	}

	function cleanUserName(nick) {
		nick = tr(nick).toLowerCase()
		nick = nick.replace(/[^a-z]/g, '');
		return nick
	}

	function getChannel(chat) {
		if(db.get('users.'+chat).value()) {
			return getIrcdNick()
		}
		return db.get('chats.'+chat).value()
	}

	function setChannel(channel, chat) {
		chat = parseInt(chat)
		if(!chat) return
		db.set('chats.'+chat, channel).write()
	}

	function getNick(user) {
		return db.get('users.'+user+'.nick')
	}

	function getRealName(user) {
		return db.get('users.'+user+'.realName')
	}

	function getUserName(user) {
		return db.get('users.'+user+'.userName')
	}

	function getMask(user) {
		return getNick(user)+'!'+getUserName(user)+'@telegram'
	}

	function getIrcdNick() {
		if(irc._connections[0]) {
			return irc._connections[0].nickname
		}
	}

	function getIrcdMask() {
		if(irc._connections[0]) {
			return irc._connections[0].mask
		}
	}

	async function telemsg(chat, message) {
		if(!chat || !message) return
		log(`To telegram ${chat}: ${message}`)
		client.invoke({
			_: 'sendMessage',
			chat_id: chat,
			input_message_content: {
				_: 'inputMessageText',
				text: {
					_: 'formattedText',
					text: message
				}
			}
		})
	}

	function ircdmsg(message) {
		var mask = getMask(message.sender_user_id)
		var text = message.content.text.text
		var channel = getChannel(message.chat_id)
		if(!channel) return
		text = text.split('\n')
		for(let line of text) {
			if(!line) continue
			var reply = message.replybox || ''
			msg = ':'+mask+' PRIVMSG '+channel+' :'+reply+line
			log(`To irc ${msg}`)
			for (var i in irc._connections) {
				if (!irc._connections[i]._socket.destroyed) {
					irc._connections[i].send(msg);
				}
			}
		}
	}
}
process.on('uncaughtException', function (er) {
	console.error(er.stack)
});
main()