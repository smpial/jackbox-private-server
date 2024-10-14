# Jackbox private server
An attempt to make a private server for all jackbox games<br />
If you found a bug or want to help me, create an issue or write me on Discord: @klucva
## Unfinished functions
* Do Do Re Mi (in progress) (you need to skip playbacks)
* The Jackbox Survey Scramble (you can play, but your answers will be ignored by server)
* Artifacts and galleries (for now server only saves games jsons, no png's and gif's)

In the current state of the project you can play all games except those listed above
## How to connect to a server?
Open game options in steam and set launch arguments to `-jbg.config serverUrl=localhost` (replace localhost by your server address)

Also you can set custom room code by adding `roomCode=TEST licenseId=licenseId` after serverUrl (replace licenseId by one of licenses from config.json)
## How to connect to the game?
To connect to the game you need your clone of jackbox.tv and in all scripts where ecast.jackboxgames.com appears, replace it with your server address

Maybe in the future I will publish a script for cloning jackbox.tv
## Setup
Rename config.example.json to config.json

In config.json you need to change:
* serverUrl by your server address (please note that serverUrl is also found in the configs of the games quiplash3, Everyday, WorldChampions, JackboxTalks and BlankyBlank)
* polly accessKeyId and secretAccessKey by your amazon aws keys (you can disable it, but all games, that using voice generation, will not work, such as rap battle, blather round, fixytest, etc.)
* polly uploadUrl by your url, which accepts multipart/form-data with 'file' and the name of this file, uploads it to the server and returns a link to the file or changes a status code if an error occurs
* internalToken by your token (used in debug, external requests and polly responses upload)
* allowedOrigins by list of your urls for Access-Control-Allow-Origin header
* ssl cert and key by path to your ssl cert and key (with ./ at the start of file path)
* licenses used to force room code, I recommend to make them hard and keep in secret

If you want, you can change game configs, but I don't recommend to do that

Next you need to install modules:
`npm i`

Then run server by command `node server.js` and enjoy!
