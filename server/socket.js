const socketIo = require('socket.io');

const socketConfig = (server) => {
  const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (userId) => { socket.join(userId); });
    socket.on('sendMessage', (data) => { io.emit('receiveMessage', data); });
    socket.on('deleteMessage', (id) => { io.emit('messageDeleted', id); });
    socket.on('editMessage', (data) => { io.emit('messageEdited', data); });
    socket.on('deleteForEveryone', (id) => { io.emit('messageDeletedForEveryone', id); });
    socket.on('typing', (data) => { socket.broadcast.emit('userTyping', data); });
    socket.on('stopTyping', (data) => { socket.broadcast.emit('userStopTyping', data); });
    socket.on('reactionUpdate', (data) => { io.emit('messageReactionUpdate', data); });
    socket.on('pollVoteUpdate', (data) => { io.emit('pollVoteUpdate', data); });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};

module.exports = socketConfig;
