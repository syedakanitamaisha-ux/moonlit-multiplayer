# Moonlit Village Online

A real-time, original one-night werewolf-style social deduction web app.

## Features
- Multiplayer online rooms
- Host/admin controls
- 4-digit room code joining
- Private role screen per player
- Voice narration using browser speech synthesis
- Role animations
- Automated night actions:
  - Seer checks one player or two center cards
  - Robber swaps with another player and sees the new card
  - Troublemaker swaps two other players
  - Insomniac checks final card at the end
- Voting and result reveal

## Run locally
```bash
npm install
npm start
```
Open: http://localhost:3000

## Test on phones in the same Wi-Fi
Run on your laptop, then open:
`http://YOUR_LAPTOP_LOCAL_IP:3000`

## Deploy idea
Deploy to Render/Railway/Fly.io or any Node.js hosting. Static hosting alone will not support real-time multiplayer because this version needs a Node + Socket.IO server.

## Legal note
This is an original prototype inspired by the social-deduction genre. It avoids copyrighted branding/artwork.
