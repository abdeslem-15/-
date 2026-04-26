importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBB-2reGub9Yz8HszUWsJqG_tLaxKYqD4E",
  authDomain: "gen-lang-client-0499033598.firebaseapp.com",
  projectId: "gen-lang-client-0499033598",
  storageBucket: "gen-lang-client-0499033598.firebasestorage.app",
  messagingSenderId: "16427276058",
  appId: "1:16427276058:web:5c1d9ff613e80d09a27ea3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/firebase-logo.png' // Adjust if you have an icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
