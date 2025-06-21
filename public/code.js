(() => {
  const app = document.querySelector(".app");
  const socket = io();
  let uname;
  let replyTo = null;

  const sendSound = document.getElementById("sendSound");
  const receiveSound = document.getElementById("receiveSound");
  const ringtone = document.getElementById("ringtone");
  const remoteAudio = document.getElementById("remoteAudio");

  const callBtn = document.getElementById("callBtn");
  const endCallBtn = document.getElementById("endCallBtn");
  const incomingCallBox = document.getElementById("incoming-call");
  const acceptCallBtn = document.getElementById("acceptCallBtn");
  const declineCallBtn = document.getElementById("declineCallBtn");

  let peerConnection;
  const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  let localStream = null;
  let mediaRecorder = null;

  // Toggle password visibility
  document.getElementById("toggle-password").addEventListener("click", () => {
    const passInput = document.getElementById("password");
    passInput.type = passInput.type === "password" ? "text" : "password";
    document.getElementById("toggle-password").textContent =
      passInput.type === "password" ? "Show" : "Hide";
  });

  // Login
  document.getElementById("join-user").addEventListener("click", () => {
    const username = document.getElementById("username").value.trim().toUpperCase();
    const password = document.getElementById("password").value.trim();
    const language = document.getElementById("language-select").value;

    if (!username || !password) {
      alert("Please enter both username and password.");
      return;
    }

    socket.emit("login", { username, password, language });
  });

  socket.on("loginSuccess", (name) => {
    uname = name;
    document.querySelector(".join-screen").classList.remove("active");
    document.querySelector(".chat-screen").classList.add("active");
    document.getElementById("message-input").focus();
  });

  socket.on("loginFailed", (msg) => alert(msg));

  // Send message
  document.getElementById("send-message").addEventListener("click", sendMessage);
  document.getElementById("message-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  function sendMessage() {
    const input = document.getElementById("message-input");
    const message = input.value.trim();
    if (!message) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msgData = { username: "You", text: message, time, replyTo };
    renderMessage("my", msgData);
    socket.emit("chat", { username: uname, text: message, time, replyTo });
    input.value = "";
    replyTo = null;
    hideReplyPreview();
    if (sendSound) sendSound.play();
  }

  socket.on("chat", (message) => {
    if (message.username !== uname) {
      renderMessage("other", message);
      if (receiveSound) receiveSound.play();
    }
  });

  socket.on("userList", (userList) => {
    const userUl = document.getElementById("users");
    userUl.innerHTML = "";
    userList.forEach((user) => {
      const li = document.createElement("li");
      li.textContent = user;
      li.classList.add("online");
      userUl.appendChild(li);
    });
  });

  function renderMessage(type, message) {
    const msgBox = document.querySelector(".messages");
    const el = document.createElement("div");
    el.classList.add("message", type === "my" ? "my" : "other-message");

    let replyHtml = "";
    if (message.replyTo) {
      replyHtml = `<div class="reply"><b>${message.replyTo.username}</b>: ${message.replyTo.text}</div>`;
    }

    let audioHtml = "";
    if (message.audio) {
      audioHtml = `<div class="audio-message"><audio controls src="${message.audio}"></audio></div>`;
    }

    el.innerHTML = `
      ${replyHtml}
      <div>
        <div class="name">${message.username} <span class="time">${message.time || ""}</span></div>
        <div class="text">${message.text || ""}</div>
        ${audioHtml}
      </div>
    `;

    msgBox.appendChild(el);
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  // Reply preview logic
  function showReplyPreview(replyTo) {
    const replyBox = document.querySelector(".reply-preview");
    if (!replyBox) return;
    replyBox.querySelector(".reply-text").innerHTML = `<b>${replyTo.username}</b>: ${replyTo.text}`;
    replyBox.classList.add("active");
  }

  function hideReplyPreview() {
    const replyBox = document.querySelector(".reply-preview");
    if (!replyBox) return;
    replyBox.classList.remove("active");
    replyBox.querySelector(".reply-text").innerHTML = "";
  }

  document.getElementById("cancel-reply").addEventListener("click", () => {
    replyTo = null;
    hideReplyPreview();
  });

  document.getElementById("exit-chat").addEventListener("click", () => {
    if (confirm("Are you sure you want to logout?")) {
      socket.emit("exituser", uname);
      window.location.reload();
    }
  });

  // Voice message recording
  document.getElementById("recordBtn")?.addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit("voiceMessage", { audio: reader.result, username: uname });
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 5000);
  });

  socket.on("voiceMessage", (data) => {
    if (data.username !== uname) {
      renderMessage("other", {
        ...data,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
    }
  });

  // Call functionality
  callBtn?.addEventListener("click", async () => {
    peerConnection = new RTCPeerConnection(config);
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = e => {
      if (e.candidate) socket.emit("call-candidate", e.candidate);
    };
    peerConnection.ontrack = e => remoteAudio.srcObject = e.streams[0];
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("call-offer", offer);
    endCallBtn.style.display = "inline-block";
    renderMessage("my", { username: uname, text: "📞 You started a call", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  });

  endCallBtn?.addEventListener("click", () => {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    remoteAudio.srcObject = null;
    endCallBtn.style.display = "none";
    renderMessage("my", { username: uname, text: "📴 Call ended", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  });

  socket.on("call-offer", async (offer) => {
    incomingCallBox.style.display = "flex";
    ringtone.play();
    acceptCallBtn.onclick = async () => {
      ringtone.pause();
      incomingCallBox.style.display = "none";
      peerConnection = new RTCPeerConnection(config);
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      peerConnection.ontrack = e => remoteAudio.srcObject = e.streams[0];
      peerConnection.onicecandidate = e => {
        if (e.candidate) socket.emit("call-candidate", e.candidate);
      };
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("call-answer", answer);
      endCallBtn.style.display = "inline-block";
      renderMessage("other", { username: "📞 Call Accepted", text: "", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    };

    declineCallBtn.onclick = () => {
      ringtone.pause();
      incomingCallBox.style.display = "none";
      renderMessage("other", { username: "❌ Call Declined", text: "", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    };
  });

  socket.on("call-answer", async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on("call-candidate", async (candidate) => {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  });

  // Menu toggle logic
  const menuButton = document.querySelector(".menu-button");
  const menuDropdown = document.getElementById("menuDropdown");

  menuButton?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menuDropdown) {
      menuDropdown.style.display = menuDropdown.style.display === "block" ? "none" : "block";
    }
  });

  document.addEventListener("click", () => {
    if (menuDropdown) menuDropdown.style.display = "none";
  });

  // Dark mode toggle
  document.getElementById("dark-mode-toggle")?.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });

  // Chat history on login
  socket.on("chatHistory", (messages) => {
    messages.forEach(msg => {
      const type = msg.username === uname ? "my" : "other";
      renderMessage(type, msg);
    });
  });

})();
