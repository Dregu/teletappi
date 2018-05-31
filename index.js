#!/usr/bin/env node

const { Client } = require('tdl')
const term = require('terminal-kit').terminal
const nconf = require('nconf')
nconf.file({ file: 'config.json' })
var chats = [], menu = [], history = [], users = {}, buffers = {}, active = 0, inputField, lastmsg, messages = {}

async function main() {
  const client = new Client({
    apiId: nconf.get('apiId'),
    apiHash: nconf.get('apiHash'),
    loginDetails: {
      phoneNumber: nconf.get('phoneNumber')
    }
  })

  client
    .on('update', update => {
      if(update._ == 'updateNewMessage') {
        if(update.message.content._ == 'messageText') {
          var newMsg = update.message;
          newMessage(newMsg)
        }
      } else if(update._ == 'updateUser') {
        newUser(update.user)
      } else {
        //console.log('Got update:', JSON.stringify(update, null, 2))
      }
    })
    .on('error', err => {
      //console.error('Got error:', JSON.stringify(err, null, 2))
  })

  await client.connect()

  async function newUser(user) {
    users[user.id] = '@' + user.username + ' (' + (user.first_name + ' ' + user.last_name).trim() + ')'
    if(!user.username) users[user.id] = (user.first_name + ' ' + user.last_name).trim()
  }

  function getUser(user_id) {
    if(users[user_id]) {
      return users[user_id]
    } else {
      return 'Anonymous'
    }
  }

  function getChat(chat_id) {
    for(let chat of chats) {
      if(chat.id == chat_id) return chat
    }
    return undefined
  }

  function newMessage(message) {
    if(message.content._ != 'messageText' || message.content.text._ != 'formattedText') return
    if(buffers[message.chat_id] === undefined) buffers[message.chat_id] = []
    for(let msg of buffers[message.chat_id]) {
      if(msg.id == message.id) return
    }
    messages[message.id] = message
    var newMsg = {
      id: message.id,
      date: message.date,
      user_id: message.sender_user_id,
      text: message.content.text.text,
      original: message
    }
    buffers[message.chat_id].push(newMsg)
    buffers[message.chat_id].sort((a, b) => { return a.id - b.id })
    if(message.chat_id == active) {
      drawBuffer()
    }
  }

  function clearPending() {
    for(let i = 0; i < buffers[active].length; i++) {
      if(buffers[active][i].original.sending_state) buffers[active].splice(i, 1)
    }
  }

  function formatDate(date) {
    var time = new Date(1000*date)
    return time.getDate() + '.' + (1+time.getMonth()) + '. ' + (time.getHours()<10?'0':'') + time.getHours() + ':' + (time.getMinutes()<10?'0':'') + time.getMinutes() + ':' + (time.getSeconds()<10?'0':'') + time.getSeconds()
  }

  function formatLine(message) {
    if(!message) return undefined
    var date = formatDate(message.date)
    var user = getUser(message.user_id)
    if(message.original.reply_to_message_id && messages[message.original.reply_to_message_id]) {
      user += '^R -> ^W' + getUser(messages[message.original.reply_to_message_id].sender_user_id)
    }
    user = user.trim()
    var text = message.text.replace(/\n/g, '\n  ')
    var blank = Array(term.width-date.length-user.replace(/\^./g, '').length).join(' ')
    if(lastmsg && lastmsg.user_id == message.user_id && lastmsg.date > message.date-5*60) {
      return `^w  ${text}`
    } else {
      lastmsg = message
      return `^W${user}${blank}^K${date}\n^w  ${text}`
    }
  }

  function drawBuffer() {
    if(!active) return
    lastmsg = undefined
    let rows = term.height
    let chat = getChat(active)
    term.clear()
    term.moveTo(1, 1)
    let read = []
    for(let i = 0; i < term.height; i++) {
      let line = formatLine(buffers[active][i])
      if(line) {
        term(line + '\n')
        read.push(buffers[active][i].id)
      }
    }
    client.invoke({
      _: 'viewMessages',
      chat_id: active,
      message_ids: read
    })
    //term.moveTo(1, term.height-1)
    term.green(chat.title + ' (' + chat.id + ')\n')
    if(inputField) {
      inputField.resume()
      inputField.redraw()
    }
  }

  async function prompt() {
    term.moveTo(1, term.height)
    term(Array(term.width).join(' '))
    term.moveTo(1, term.height)
    inputField = term.inputField({
      history: history
    }, (err, input) => {
      if(input.length == 0) {
        prompt()
        return
      }
      history.push(input)
      client.invoke({
        _: 'sendMessage',
        chat_id: active,
        input_message_content: {
          _: 'inputMessageText',
          text: {
            _: 'formattedText',
            text: input
          }
        }
      })
      prompt()
    })
    if(!active) inputField.pause()
  }

  async function getChats() {
    chats = [], menu = []
    const ids = await client.invoke({
      _: 'getChats',
      offset_order: '9223372036854775807',
      offset_chat_id: 0,
      limit: term.height-1
    })
    await Promise.all(ids.chat_ids.map(async (chat_id) => {
      await client.invoke({
        _: 'getChat',
        chat_id: chat_id
      }).then(newChat => {
        chats.push(newChat)
        menu.push(newChat.title + (newChat.unread_count > 0?' (' + newChat.unread_count + ')':''))
        if(buffers[newChat.id] === undefined) {
          buffers[newChat.id] = []
        }
        let newChatId = newChat.id
        client.invoke({
          _: 'getChatHistory',
          chat_id: newChatId,
          limit: term.height
        }).then((messages) => {
          for(let message of messages.messages) {
            var newMsg = message
            newMessage(newMsg)
          }
        })
      })
    }))
  }

  await getChats()
  
  async function chatMenu() {
    if(inputField) inputField.pause()
    term.clear()
    term.singleColumnMenu(menu, { y: 1, extraLines: 1 }, async (err, res) => {
      if(active) {
        await client.invoke({
          _: 'closeChat',
          chat_id: active
        })
      }
      active = chats[res.selectedIndex].id
      await client.invoke({
        _: 'openChat',
        chat_id: active
      })
      await client.invoke({
        _: 'getChatHistory',
        chat_id: active,
        limit: term.height
      }).then((messages) => {
        for(let message of messages.messages) {
          var newMsg = message
          newMessage(newMsg)
        }
      }).then(function() {
        clearPending()
        drawBuffer()
      })
    })
  }
  
  function quit() {
    term.grabInput(false)
    process.exit()
  }
  
  term.fullscreen()
  term.grabInput({ })
  term.on('key', async (name, matches, data) => {
    if(name === 'TAB' && active != 0) {
      active = 0
      await getChats()
      chatMenu()
    }
    if(name === 'CTRL_C') {
      quit()
    }
  })
  term.on('terminal', (name, data) => {
    //console.log('event: ', name, data)
  })
  await chatMenu()
  prompt()
}

main()
