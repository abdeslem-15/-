import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const messaging: Messaging | null = typeof window !== 'undefined' ? getMessaging(app) : null;
const googleProvider = new GoogleAuthProvider();

export const requestNotificationPermission = async (user: User) => {
  if (!messaging) return;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: 'BD8I-4M_C-t8_t3_t3_t3_t3_t3_t3_t3_t3_t3_t3_t3' // Placeholder, user will need to provide their own or I can try without it
      });
      
      if (token) {
        await setDoc(doc(db, 'users', user.uid), {
          fcmToken: token,
          notificationsEnabled: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
        return token;
      }
    }
  } catch (error) {
    console.error("Error requesting notification permission", error);
  }
  return null;
};

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Create or update user profile
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp()
      });
    }
    
    return user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = () => auth.signOut();
