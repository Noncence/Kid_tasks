// Глобальная переменная для текущего пользователя
let currentUser = null;

// Анонимная авторизация
async function signInAnonymously() {
    try {
        const userCredential = await auth.signInAnonymously();
        currentUser = userCredential.user;
        console.log('Анонимный пользователь авторизован:', currentUser.uid);
        return currentUser;
    } catch (error) {
        console.error('Ошибка анонимной авторизации:', error);
        return null;
    }
}

// Инициализация Firebase
async function initFirebase() {
    try {
        console.log('Инициализация Firebase...');
        
        // Автоматическая анонимная авторизация
        currentUser = await signInAnonymously();
        
        if (currentUser) {
            console.log('Firebase инициализирован, пользователь:', currentUser.uid);
        } else {
            console.log('Firebase инициализирован, но пользователь не авторизован');
        }
        
        return true;
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
        return false;
    }
}

// Сохранение данных пользователя
async function saveUserData(userId, data) {
    try {
        await db.collection('users').doc(userId).set({
            ...data,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log('Данные сохранены в Firebase');
        return true;
    } catch (error) {
        console.error('Ошибка сохранения в Firebase:', error);
        return false;
    }
}

// Загрузка данных пользователя
async function loadUserData(userId) {
    try {
        const doc = await db.collection('users').doc(userId).get();
        if (doc.exists) {
            console.log('Данные загружены из Firebase');
            return doc.data();
        }
        console.log('В Firebase нет данных для пользователя:', userId);
        return null;
    } catch (error) {
        console.error('Ошибка загрузки из Firebase:', error);
        return null;
    }
}