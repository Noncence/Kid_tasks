// =============================
//   ИНИЦИАЛИЗАЦИЯ FIREBASE
// =============================

// ВАЖНО: firebaseConfig должен быть объявлен раньше
// Пример:
// const firebaseConfig = { ... };

console.log("Firebase: запускаем инициализацию...");

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

console.log("Firebase: app =", app);
console.log("Firebase: auth =", auth);
console.log("Firebase: db =", db);

// Глобальная переменная
let currentUser = null;


// =============================
//   АНОНИМНАЯ АВТОРИЗАЦИЯ
// =============================
async function signInAnonymously() {
    try {
        const userCredential = await auth.signInAnonymously();
        currentUser = userCredential.user;
        console.log("Анонимный пользователь авторизован:", currentUser.uid);
        return currentUser;
    } catch (error) {
        console.error("Ошибка анонимной авторизации:", error);
        return null;
    }
}


// =============================
//   ИНИЦИАЛИЗАЦИЯ FIREBASE
// =============================
async function initFirebase() {
    try {
        console.log("Инициализация Firebase...");

        currentUser = await signInAnonymously();

        if (currentUser) {
            console.log("Firebase инициализирован, пользователь:", currentUser.uid);
        } else {
            console.log("Firebase инициализирован, но пользователь не авторизован");
        }

        return true;
    } catch (error) {
        console.error("Ошибка инициализации Firebase:", error);
        return false;
    }
}


// =============================
//   РАБОТА С FIRESTORE
// =============================
async function saveGlobalData(data) {
    try {
        await db.collection("app").doc("tasks").set({
            ...data,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log("Глобальные данные сохранены в Firebase");
        return true;
    } catch (error) {
        console.error("Ошибка сохранения глобальных данных:", error);
        return false;
    }
}

async function loadGlobalData() {
    try {
        const doc = await db.collection("app").doc("tasks").get();
        if (doc.exists) {
            console.log("Глобальные данные загружены из Firebase");
            return doc.data();
        }
        console.log("В Firebase нет глобальных данных");
        return null;
    } catch (error) {
        console.error("Ошибка загрузки глобальных данных:", error);
        return null;
    }
}

