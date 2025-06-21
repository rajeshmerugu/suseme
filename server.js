const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const allowedUsers = ["RAJESH", "SAKETH", "SINVITHA", "ASRITHA", "JASMITHA", "BHUVANESWARI", "CHANDRIKA", "MRUDHULA"];
const PASSWORD = "KLU2025";

const onlineUsers = new Map();
let chatHistory = [];

app.use(express.static(__dirname + "/public"));

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("login", ({ username, password, language }) => {
    username = username.toUpperCase();

    if (!allowedUsers.includes(username)) {
      socket.emit("loginFailed", "Username not allowed.");
      return;
    }
    if (password !== PASSWORD) {
      socket.emit("loginFailed", "Incorrect password.");
      return;
    }
    if ([...onlineUsers.keys()].includes(username)) {
      socket.emit("loginFailed", "User already logged in.");
      return;
    }

    onlineUsers.set(username, socket.id);
    socket.username = username;

    const validMessages = chatHistory.filter(msg => Date.now() - msg.timestamp <= 86400000);
    socket.emit("chatHistory", validMessages.map(m => m.message));

    socket.emit("loginSuccess", username);
    io.emit("update", `${username} has joined the chat.`);
    io.emit("userList", [...onlineUsers.keys()]);
  });

  socket.on("chat", (message) => {
    chatHistory.push({ message, timestamp: Date.now() });

    // Remove messages older than 24 hours
    chatHistory = chatHistory.filter(msg => Date.now() - msg.timestamp <= 86400000);

    io.emit("chat", message);
  });

  socket.on("voiceMessage", (data) => {
    io.emit("voiceMessage", data);
  });

  socket.on("exituser", (username) => {
    onlineUsers.delete(username);
    io.emit("update", `${username} left the chat.`);
    io.emit("userList", [...onlineUsers.keys()]);
  });

  socket.on("call-offer", (offer) => {
    socket.broadcast.emit("call-offer", offer);
  });

  socket.on("call-answer", (answer) => {
    socket.broadcast.emit("call-answer", answer);
  });

  socket.on("call-candidate", (candidate) => {
    socket.broadcast.emit("call-candidate", candidate);
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit("update", `${socket.username} disconnected.`);
      io.emit("userList", [...onlineUsers.keys()]);
    }
  });
});

const PORT = process.env.PORT || 1000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
