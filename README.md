# Telegram terminaali appi
Simple telegram terminal client with nodejs. A prototype really. No stickers, no photos, just plaintext. No more updates. Tilipitappi-branch is an ircd-version that might actually work.

![Screenshot](https://gist.githubusercontent.com/Dregu/ea9d82b07649c9f83c8258e82df835d3/raw/e4a7a891e7e43d558a991ecf027d96621bdd969c/teletappi.png)

## Installation
1. Get API keys from https://my.telegram.org/
2. Clone and build https://github.com/tdlib/td#building
```
cp config.json.example config.json
nano config.json
ln -s td/build/libtdjson.so
sudo npm install -g
teletappi
```
Done!

## Usage

* TAB: Change active chat
* KEYS: Type message
* ENTER: Send message
* UP/DOWN: Scroll input history

## TODO
HTTP-server for recvd documents
