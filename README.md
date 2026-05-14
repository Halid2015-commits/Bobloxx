## Bobloxx

Bobloxx is a small multiplayer parkour prototype built with Express, Socket.IO, Three.js, and Cannon.

### Play Offline/Client only
1. Run `index.html`
2. Play Alone

### Easiest Way To Play With Friends
You do not need to rent or buy a server.

The host can run Bobloxx on their own PC and make it reachable on the internet with a free tunnel.

### Host On Your Own PC
1. Open a shell in `Bobloxx`
2. Run `npm install`
3. Run `npm run dev`
4. Keep that terminal open

### Make It Reachable On The Internet For Free
1. Open a second shell in `Bobloxx`
2. Run `npm run share`
3. Wait for a message like `Share this URL with friends: https://something.loca.lt`
4. Keep that second terminal open too
5. Send that URL to your friends

That is the main no-rent, no-buy workflow.

### What Friends Should Do
1. Open the shared URL directly in a browser
2. Or open Bobloxx somewhere else and paste that URL into the `Server URL` field
3. Pick a name and map
4. Click `Join Server`

### Quick Local Start
1. Run `npm install`
2. Run `npm run dev`
3. Open `http://localhost:3000`
4. Leave `Server URL` empty
5. Click `Join Server`

### Same Wi-Fi Play
1. The host runs `npm run dev`
2. The server console shows `LAN URL(s)`
3. Other players open one of those LAN URLs
4. Or they paste that LAN URL into the `Server URL` field

### Quick Connect Box
The game menu now has a `Quick Connect` box.

- `This Page` means the current Bobloxx page is already on a server
- `Same Wi-Fi` means a LAN address for players on the same network
- `Internet` means a public address that should work across different networks
- `Use` fills the `Server URL` field
- `Copy` copies the address so you can send it to friends

If you do not see an `Internet` row yet, the host should run `npm run share`.

### Keep These In Mind
- The host must keep both terminals open while people are playing
- If `npm run share` stops, the public URL stops working
- The free tunnel URL may change next time you start it
- For a permanent custom address, you can still use your own domain and `PUBLIC_SERVER_URL`

### Optional Environment Variables
- `PUBLIC_SERVER_URL` sets a custom public address shown to players
- `SERVER_NAME` changes the displayed server name
- `HOST` changes the bind address. Default is `0.0.0.0`
- `PORT` changes the server port. Default is `3000`
- `CORS_ORIGIN` changes the allowed Socket.IO origin policy
- `TUNNEL_SUBDOMAIN` requests a specific LocalTunnel subdomain
- `TUNNEL_HOST` changes the LocalTunnel upstream host
- `TUNNEL_LOCAL_HOST` changes which local host the tunnel forwards to

### Scripts
- `npm run dev` starts the game server with `nodemon`'s features
- `npm start` runs the server once without `nodemon`
- `npm run share` starts a free internet tunnel for the current local server
- `npm run devshare` tarts a free internet tunnel for the current local server with `nodemon`'s features

### API Routes
- `GET /api/status` returns server health, maps, and connection info
- `GET /api/maps` returns the public map list
- `GET /api/connect` returns local, LAN, and internet connection info

### Main Files
- `server.js` contains the multiplayer server and API routes
- `share.js` starts the free internet tunnel and writes its public URL for the game to display
- `index.html` contains the client, UI, rendering, and movement logic
- `package.json` contains scripts and dependencies
- `Readme.md` contains this page
