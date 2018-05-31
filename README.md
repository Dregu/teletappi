# Telegram terminaali appi
Simple telegram terminal client with nodejs
## Installation
Get API keys from https://my.telegram.org/
```
cp config.json.example config.json
nano config.json
npm install
```
Clone and build https://github.com/tdlib/td#building
```
ln -s td/build/libtdjson.so
```
Done!

## Usage

* TAB: Change active chat
* KEYS: Type message
* ENTER: Send message
* UP/DOWN: Scroll input history

## TODO
HTTP-server for recvd photos
