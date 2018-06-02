# tilipitappi

Simple telegram to ircd client with nodejs. Use telegram with irssi or weechat!

## Installation
1. Get API keys from https://my.telegram.org/
2. Clone and build https://github.com/tdlib/td#building
```
ln -s td/build/libtdjson.so
npm install
chmod +x index.js
./index.js
```
Run once to generate config or edit the example. Run again and enter the authentication code.

## Usage

All your open chats have a default channel you can join, but you can also use shorter aliases. Just put the real numeric chatid as a channel key, e.g. */join #t3 -100987654321*

You will subscribe to all your chats regardless of joining them explicitly if *autojoin* is enabled in config. You can unsubscribe from the spam in your status window with */part #channel*.

Photos are saved in *\_td\_files/photos*, get your own http server and configure *http.baseUrl* if you want pretty links in irc.

### Supported IRC commands
Command | Parameters | Explanation
--- | --- | ---
LIST | | List all (recent) chats and their default channels
JOIN | <#channel> [chatid] | Subscribe to an open telegram chat as #channel |
PART | <#channel> | Unsubscribe from chat linked to #channel. Won't affect your real chats |
PRIVMSG | <#channel or nick> :\<message\> | Send a message
WHOIS | <#channel or nick> | Get the real name and chatid of a user or channel
NAMES | <#channel> | Get nicklist
WHO | <#channel> | List channel user info

## TODO
* You know what this thing needs? ASCII stickers amirite
