const express = require('express');
const path = require("path");
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

const roleDefs = {
  wolf: { id:'wolf', name:'Wolf', emoji:'🐺', team:'wolf', order:1, desc:'Stay hidden. You win if no wolf is eliminated.' },
  seer: { id:'seer', name:'Seer', emoji:'🔮', team:'village', order:2, desc:'Check one player card or two center cards.' },
  robber: { id:'robber', name:'Robber', emoji:'🕵️', team:'village', order:3, desc:'Swap your card with another player, then view your new card.' },
  troublemaker: { id:'troublemaker', name:'Troublemaker', emoji:'🎭', team:'village', order:4, desc:'Swap two other players cards without viewing them.' },
  insomniac: { id:'insomniac', name:'Insomniac', emoji:'🌙', team:'village', order:9, desc:'Check your final card at the end of night.' },
  villager: { id:'villager', name:'Villager', emoji:'👤', team:'village', order:99, desc:'No night power. Use logic to find the wolf.' }
};

const rooms = new Map();
const code = () => String(Math.floor(1000 + Math.random()*9000));
const shuffle = a => [...a].sort(() => Math.random() - .5);
const publicRoom = r => ({code:r.code, phase:r.phase, players:r.players.map(p=>({id:p.id,name:p.name,isHost:p.id===r.hostId,connected:p.connected})), log:r.publicLog, activeRole:r.activeRole, discussionSeconds:r.discussionSeconds});
const privateState = (r, sid) => {
  const player = r.players.find(p=>p.id===sid);
  if (!player) return null;
  return { you:{id:player.id, name:player.name, role: r.phase==='lobby'?null:r.cards[player.id], initialRole:r.initialCards[player.id]}, centerCount:r.center.length };
};
function emitRoom(r){ io.to(r.code).emit('room', publicRoom(r)); r.players.forEach(p=>io.to(p.id).emit('private', privateState(r,p.id))); }
function findRoomBySocket(id){ for(const r of rooms.values()) if(r.players.some(p=>p.id===id)) return r; return null; }
function deal(r){
  const n=r.players.length; let deck=['wolf','wolf','seer','robber','troublemaker','insomniac'];
  while(deck.length<n+3) deck.push('villager');
  deck=shuffle(deck).slice(0,n+3);
  r.cards={}; r.initialCards={};
  r.players.forEach((p,i)=>{ r.cards[p.id]=roleDefs[deck[i]]; r.initialCards[p.id]=roleDefs[deck[i]]; });
  r.center=deck.slice(n).map(x=>roleDefs[x]); r.phase='reveal'; r.publicLog=[]; r.activeRole=null; r.votes={}; r.seen={};
}
function nextNightRole(r){
  const roles = [...new Set(Object.values(r.initialCards).map(x=>x.id))].map(id=>roleDefs[id]).filter(x=>x.order<99).sort((a,b)=>a.order-b.order);
  const current = r.activeRole ? roles.findIndex(x=>x.id===r.activeRole) : -1;
  const next = roles[current+1];
  if(next){ r.activeRole=next.id; r.phase='night'; r.publicLog.push(`${next.emoji} ${next.name} phase`); }
  else { r.activeRole=null; r.phase='discussion'; r.discussionSeconds=300; r.publicLog.push('Discussion started'); }
}

io.on('connection', socket => {
  socket.on('createRoom', ({name}, cb)=>{
    let c; do c=code(); while(rooms.has(c));
    const r={code:c, hostId:socket.id, phase:'lobby', players:[{id:socket.id,name:name||'Host',connected:true}], cards:{}, initialCards:{}, center:[], publicLog:[], activeRole:null, votes:{}, seen:{}, discussionSeconds:300};
    rooms.set(c,r); socket.join(c); cb?.({ok:true, code:c}); emitRoom(r);
  });
  socket.on('joinRoom', ({code,name}, cb)=>{
    const r=rooms.get(String(code)); if(!r) return cb?.({ok:false,error:'Room not found'});
    if(r.phase!=='lobby') return cb?.({ok:false,error:'Game already started'});
    r.players.push({id:socket.id,name:name||'Player',connected:true}); socket.join(r.code); cb?.({ok:true, code:r.code}); emitRoom(r);
  });
  socket.on('startGame', ()=>{ const r=findRoomBySocket(socket.id); if(!r||r.hostId!==socket.id) return; deal(r); emitRoom(r); });
  socket.on('beginNight', ()=>{ const r=findRoomBySocket(socket.id); if(!r||r.hostId!==socket.id) return; nextNightRole(r); emitRoom(r); });
  socket.on('nextNight', ()=>{ const r=findRoomBySocket(socket.id); if(!r||r.hostId!==socket.id) return; nextNightRole(r); emitRoom(r); });

  socket.on('robberSwap', ({targetId}, cb)=>{
    const r=findRoomBySocket(socket.id); if(!r||r.activeRole!=='robber'||r.initialCards[socket.id]?.id!=='robber') return cb?.({ok:false,error:'Not your action'});
    if(!r.cards[targetId] || targetId===socket.id) return cb?.({ok:false,error:'Invalid target'});
    [r.cards[socket.id], r.cards[targetId]]=[r.cards[targetId], r.cards[socket.id]];
    r.publicLog.push('Robber swapped with another player.'); cb?.({ok:true,newRole:r.cards[socket.id]}); emitRoom(r);
  });
  socket.on('troublemakerSwap', ({a,b}, cb)=>{
    const r=findRoomBySocket(socket.id); if(!r||r.activeRole!=='troublemaker'||r.initialCards[socket.id]?.id!=='troublemaker') return cb?.({ok:false,error:'Not your action'});
    if(!r.cards[a]||!r.cards[b]||a===b||a===socket.id||b===socket.id) return cb?.({ok:false,error:'Choose two other players'});
    [r.cards[a], r.cards[b]]=[r.cards[b], r.cards[a]]; r.publicLog.push('Troublemaker swapped two players.'); cb?.({ok:true}); emitRoom(r);
  });
  socket.on('seerCheck', ({type, targetId}, cb)=>{
    const r=findRoomBySocket(socket.id); if(!r||r.activeRole!=='seer'||r.initialCards[socket.id]?.id!=='seer') return cb?.({ok:false,error:'Not your action'});
    if(type==='player' && r.cards[targetId]) return cb?.({ok:true, seen:[{name:r.players.find(p=>p.id===targetId).name, role:r.cards[targetId]}]});
    if(type==='center') return cb?.({ok:true, seen:r.center.slice(0,2).map((role,i)=>({name:`Center ${i+1}`,role}))});
    cb?.({ok:false,error:'Invalid check'});
  });
  socket.on('insomniacCheck', (cb)=>{
    const r=findRoomBySocket(socket.id); if(!r||r.activeRole!=='insomniac'||r.initialCards[socket.id]?.id!=='insomniac') return cb?.({ok:false,error:'Not your action'});
    cb?.({ok:true, role:r.cards[socket.id]});
  });
  socket.on('vote', ({targetId})=>{ const r=findRoomBySocket(socket.id); if(!r||r.phase!=='vote') return; r.votes[socket.id]=targetId; emitRoom(r); });
  socket.on('goVote', ()=>{ const r=findRoomBySocket(socket.id); if(!r||r.hostId!==socket.id) return; r.phase='vote'; emitRoom(r); });
  socket.on('showResult', ()=>{ const r=findRoomBySocket(socket.id); if(!r||r.hostId!==socket.id) return; r.phase='result'; emitRoom(r); io.to(r.code).emit('result', result(r)); });
  socket.on('disconnect', ()=>{ const r=findRoomBySocket(socket.id); if(!r) return; const p=r.players.find(p=>p.id===socket.id); if(p) p.connected=false; emitRoom(r); });
});
function result(r){
  const counts={}; Object.values(r.votes).forEach(id=>counts[id]=(counts[id]||0)+1);
  const max=Math.max(0,...Object.values(counts)); const eliminated=Object.keys(counts).filter(id=>counts[id]===max);
  const wolfEliminated=eliminated.some(id=>r.cards[id]?.team==='wolf');
  return { eliminated: eliminated.map(id=>r.players.find(p=>p.id===id)?.name), villageWins:wolfEliminated, roles:r.players.map(p=>({name:p.name, role:r.cards[p.id]})), center:r.center };
}
server.listen(PORT, ()=>console.log(`Moonlit Village running on http://localhost:${PORT}`));
