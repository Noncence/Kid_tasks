// Локальное хранилище данных
let appData = {
    parentPassword: '1234',
    child: {
        name: 'Ребенок',
        avatar: 'https://dummyimage.com/150x150/6C5CE7/ffffff.png&text=👶',
        level: 1,
        points: 0,
        lastSeen: null,
        levelUpNotification: false,
        moneyUpNotification: false
    },
    tasks: [],
    withdrawalRequests: [],
    piggyNotifications: []
};

// Проверяем начальные данные при загрузке
if (!appData.parentPassword && !appData.parentPasswordHash) {
    console.log('⚠️ Пароль родителя не найден, устанавливаем по умолчанию');
    appData.parentPassword = '1234'; // По умолчанию
}


async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'family_dashboard_salt_v2');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getDeviceId() {
    let deviceId = localStorage.getItem('familyDashboard_deviceId');
    if (!deviceId) {
        // Создаем уникальный ID на основе времени и случайных символов
        deviceId = 'device_' + Date.now() + '_' + 
                   Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
        localStorage.setItem('familyDashboard_deviceId', deviceId);
    }
    return deviceId;
}

// Кэш для предотвращения лишних обновлений UI
const uiCache = {
    avatar: '',
    lastSeen: '',
    points: 0,
    level: 0,
    tasksCount: 0,
    piggyAmount: 0
};

let isSyncing = false; // Флаг синхронизации
let isSubmittingTask = false;
let currentPiggyChange = 0;

// Добавьте в начало файла после объявления appData
const SUPABASE_URL = 'https://dtznzrupipzcyfdieqsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0em56cnVwaXB6Y3lmZGllcXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NDUyOTAsImV4cCI6MjA3OTMyMTI5MH0.Cd_pxer7n79NbE18i5FQA2y6JQJIwMvh2tZRz9WZPG8';

// Инициализация Supabase клиента
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Флаг для отслеживания использования Supabase
let useSupabaseStorage = true;

// Функция для загрузки файлов в Supabase
async function uploadToSupabase(attachment, taskId, type = 'attachment') {
    console.log(`📤 Начало загрузки в Supabase:`, { type, taskId, attachmentType: attachment.type });

    if (!useSupabaseStorage) {
        console.log('📝 Используем base64 (Supabase отключен)');
        return attachment;
    }

    try {
        // Создаем уникальное имя файла
        const fileExtension = getFileExtension(attachment.type);
        const fileName = `${type}_${taskId}_${Date.now()}.${fileExtension}`;
        
        console.log(`📁 Имя файла: ${fileName}`);

        // Конвертируем base64 в Blob если нужно
        let fileBlob;
        if (attachment.data && attachment.data.startsWith('data:')) {
            console.log('🔄 Конвертируем base64 в Blob...');
            fileBlob = dataURLtoBlob(attachment.data);
        } else if (attachment.data && attachment.data.startsWith('blob:')) {
            console.log('🔄 Конвертируем blob URL...');
            const response = await fetch(attachment.data);
            fileBlob = await response.blob();
        } else {
            console.error('❌ Неподдерживаемый формат данных вложения');
            return attachment;
        }

        console.log(`📦 Размер файла: ${fileBlob.size} байт`);

        // Проверяем размер файла
        if (fileBlob.size > 50 * 1024 * 1024) {
            console.warn('⚠️ Файл слишком большой для Supabase, используем base64');
            return attachment;
        }

        // Загружаем файл в Supabase
        console.log('🚀 Загружаем в Supabase...');
        const { data, error } = await supabaseClient.storage
            .from('task-attachments')
            .upload(fileName, fileBlob, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('❌ Ошибка загрузки в Supabase:', error);
            return attachment;
        }

        console.log('✅ Файл загружен в Supabase:', data);

        // Получаем публичный URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('task-attachments')
            .getPublicUrl(fileName);

        console.log('🔗 Публичный URL:', publicUrl);

        return {
            type: attachment.type,
            url: publicUrl,
            fileName: fileName,
            supabasePath: data.path,
            uploadedAt: new Date().toISOString(),
            size: fileBlob.size
        };

    } catch (error) {
        console.error('❌ Ошибка при загрузке в Supabase:', error);
        return attachment;
    }
}

// Вспомогательные функции
function getFileExtension(mimeType) {
    const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'audio/wav': 'wav',
        'audio/mpeg': 'mp3'
    };
    return extensions[mimeType] || 'bin';
}

function dataURLtoBlob(dataURL) {
    const byteString = atob(dataURL.split(',')[1]);
    const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: mimeString });
}

// Проверка доступности Supabase
async function checkSupabaseAvailability() {
    try {
        const { data, error } = await supabaseClient.storage
            .from('task-attachments')
            .list('', { limit: 1 });
        
        if (error) {
            console.warn('Supabase недоступен, используем base64 хранение');
            useSupabaseStorage = false;
        } else {
            useSupabaseStorage = true;
        }
    } catch (error) {
        console.warn('Supabase недоступен:', error);
        useSupabaseStorage = false;
    }
}

// Защита страниц - УПРОЩЕННАЯ ВЕРСИЯ
function protectPage(requiredRole) {
    // Если это главная страница - защита не нужна
    if (window.location.pathname.includes('index.html') || 
        window.location.pathname === '/' || 
        window.location.pathname.endsWith('/')) {
        return;
    }
    
    // Только родительская страница требует пароль
    if (requiredRole === 'parent') {
        const parentAuthenticated = sessionStorage.getItem('parentAuthenticated') === 'true';
        
        if (!parentAuthenticated) {
            // Перенаправляем на главную для ввода пароля
            window.location.href = 'index.html';
            return;
        }
    }
    
    // Детская страница доступна всем - ничего не делаем
}

// Функция для выхода
function logout() {
    sessionStorage.removeItem('parentAuthenticated');
    window.location.href = 'index.html';
}

// Выбор роли на стартовой странице
function selectRole(role) {
    console.log('Выбрана роль:', role);
    if (role === 'child') {
        // Для ребенка сразу переходим на детскую страницу
        window.location.href = 'child.html';
    } else if (role === 'parent') {
        // Для родителя показываем окно ввода пароля
        const modal = getElement('parentLoginModal');
        if (modal) modal.style.display = 'block';
    }
}

// Безопасное экранирование HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Безопасный поиск элемента
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Элемент с id "${id}" не найден`);
    }
    return element;
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM загружен, инициализация...');
    
    try {
        // Инициализируем Firebase
        await initFirebase();
        await checkSupabaseAvailability();
        
        // Загружаем данные (только из Firebase)
        await loadData();
        
        // Инициализируем страницу
        initCurrentPage();
        
        console.log('Приложение инициализировано');
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showNoInternetMessage();
    }
    
    // Автоматическая синхронизация каждые 3 минуты
    setInterval(async () => {
        if (currentUser && !isSyncing && !isSubmittingTask && navigator.onLine) {
            isSyncing = true;
            console.log('Автоматическая синхронизация...');
            
            try {
                await loadData();
                
                // Оптимизированное обновление UI
                if (window.location.pathname.includes('child.html')) {
                    optimizedUpdateChildUI();
                } else if (window.location.pathname.includes('parent.html')) {
                    optimizedUpdateParentUI();
                }
            } catch (error) {
                console.error('Ошибка синхронизации:', error);
            } finally {
                isSyncing = false;
            }
        }
    }, 180000);
});

// Оптимизированное обновление детского UI
function optimizedUpdateChildUI() {
    // Проверяем изменения перед обновлением
    const avatarChanged = uiCache.avatar !== appData.child.avatar;
    const lastSeenChanged = uiCache.lastSeen !== appData.child.lastSeen;
    const pointsChanged = uiCache.points !== appData.child.points;
    const levelChanged = uiCache.level !== appData.child.level;
    const tasksChanged = uiCache.tasksCount !== appData.tasks.length;
    
    if (avatarChanged || lastSeenChanged) {
        updateChildHeader();
        uiCache.avatar = appData.child.avatar;
        uiCache.lastSeen = appData.child.lastSeen;
    }
    
    if (pointsChanged || levelChanged) {
        updateChildStats();
        uiCache.points = appData.child.points;
        uiCache.level = appData.child.level;
    }
    
    if (tasksChanged) {
        renderChildTasks();
        uiCache.tasksCount = appData.tasks.length;
    }
}

// Оптимизированное обновление родительского UI
function optimizedUpdateParentUI() {
    const lastSeenChanged = uiCache.lastSeen !== appData.child.lastSeen;
    const pointsChanged = uiCache.points !== appData.child.points;
    const levelChanged = uiCache.level !== appData.child.level;
    const tasksChanged = uiCache.tasksCount !== appData.tasks.length;
    const piggyChanged = uiCache.piggyAmount !== (appData.child.piggyBankAmount || 0); // ← ДОБАВЛЯЕМ ЭТО
    
    if (lastSeenChanged) {
        updateParentHeader();
        uiCache.lastSeen = appData.child.lastSeen;
    }
    
    if (pointsChanged || levelChanged) {
        updateParentStats();
        uiCache.points = appData.child.points;
        uiCache.level = appData.child.level;
    }
    
    if (tasksChanged) {
        renderParentTasks();
        uiCache.tasksCount = appData.tasks.length;
    }
    
    if (piggyChanged) { // ← ДОБАВЛЯЕМ ЭТО
        updateParentPiggyInfo();
        uiCache.piggyAmount = appData.child.piggyBankAmount || 0;
    }
}

// Функция для инициализации текущей страницы
function initCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('child.html')) {
        console.log('Инициализация страницы ребенка');
        initChildPage();
    } else if (path.includes('parent.html')) {
        console.log('Инициализация страницы родителя');
        initParentPage();
    } else {
        console.log('Главная страница');
    }
}

function showNoInternetMessage() {
    // Проверяем, не показано ли уже сообщение
    if (document.getElementById('noInternetMessage')) return;
    
    const messageHtml = `
        <div id="noInternetMessage" class="no-internet-overlay">
            <div class="no-internet-content">
                <div class="no-internet-icon">📶</div>
                <h2>Нет подключения к интернету</h2>
                <p>Приложению требуется интернет для работы</p>
                <div class="no-internet-actions">
                    <button onclick="retryConnection()" class="btn-primary">🔄 Повторить</button>
                    <button onclick="closeNoInternetMessage()" class="btn-reject">Закрыть</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', messageHtml);
    
    // Блокируем взаимодействие с приложением
    document.body.style.overflow = 'hidden';
}

function closeNoInternetMessage() {
    const message = document.getElementById('noInternetMessage');
    if (message) {
        message.remove();
        document.body.style.overflow = '';
    }
}

function retryConnection() {
    closeNoInternetMessage();
    
    if (navigator.onLine && currentUser) {
        // Перезагружаем данные
        loadData().then(() => {
            // Обновляем UI после загрузки
            initCurrentPage();
        });
    } else {
        // Показываем сообщение снова
        setTimeout(() => showNoInternetMessage(), 500);
    }
}

// Обновленная функция загрузки данных
async function loadData() {
    console.log('📥 Начало загрузки данных...');
    
    if (isSubmittingTask) {
        console.log('⚠️ Пропускаем загрузку - идет отправка задания');
        return;
    }

    // Проверяем подключение к интернету
    if (!navigator.onLine) {
        console.log('📵 Нет подключения к интернету');
        showNoInternetMessage();
        return;
    }

    // Проверяем аутентификацию Firebase
    if (!currentUser) {
        console.log('🔐 Пользователь не аутентифицирован');
        showNoInternetMessage(); // Показываем то же сообщение
        return;
    }

    try {
        console.log('🔥 Загружаем данные только из Firebase...');
        const firebaseData = await loadGlobalData();
        
        if (firebaseData) {
            // Полностью заменяем данные из Firebase
            appData = { ...appData, ...firebaseData };
            console.log('✅ Данные загружены из Firebase');
        } else {
            console.log('⚠️ В Firebase нет данных, используем начальные настройки');
            // Можно показать сообщение о первом запуске
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных из Firebase:', error);
        showNoInternetMessage();
    }
}

// Обнови функцию saveData
async function saveData() {
    console.log('💾 Начало сохранения данных...');
    
    // Проверяем подключение к интернету
    if (!navigator.onLine || !currentUser) {
        console.log('❌ Нет подключения для сохранения');
        showNoInternetMessage();
        return false;
    }

    try {
        console.log('🔥 Сохраняем данные только в Firebase...');
        const firestoreData = prepareDataForFirestore(appData);
        await saveGlobalData(firestoreData);
        console.log('✅ Данные сохранены в Firebase');
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения данных в Firebase:', error);
        showNoInternetMessage();
        return false;
    }
}

// Функция для подготовки данных к сохранению в Firestore
function prepareDataForFirestore(data) {
    console.log('🔄 Подготовка данных для Firestore...');
    
    // Создаем глубокую копию данных
    const firestoreData = JSON.parse(JSON.stringify(data));
    
    // Функция для очистки объекта от undefined значений
    function cleanObject(obj) {
        if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => {
                if (obj[key] === undefined) {
                    console.log(`🧹 Удаляем undefined поле: ${key}`);
                    delete obj[key];
                } else if (obj[key] === null) {
                    // null допустим в Firestore, можно оставить
                } else if (typeof obj[key] === 'object') {
                    cleanObject(obj[key]);
                }
            });
        }
        return obj;
    }
    
    // Обрабатываем задания
    if (firestoreData.tasks && firestoreData.tasks.length > 0) {
        firestoreData.tasks = firestoreData.tasks.map(task => {
            // Очищаем задание от undefined полей
            task = cleanObject(task);
            
            // Обрабатываем вложения
            if (task.attachments && task.attachments.length > 0) {
                task.attachments = task.attachments
                    .filter(attachment => attachment !== undefined && attachment !== null)
                    .map(attachment => {
                        // Очищаем каждое вложение
                        attachment = cleanObject(attachment);
                        
                        // Для вложений в Supabase оставляем только метаданные
                        if (attachment.url && attachment.data) {
                            console.log(`🧹 Очищаем base64 для Supabase файла: ${attachment.fileName}`);
                            delete attachment.data; // Удаляем большие base64 данные
                        }
                        
                        return attachment;
                    });
            }
            
            return task;
        });
    }
    
    // Очищаем основной объект
    firestoreData.child = cleanObject(firestoreData.child);
    if (firestoreData.withdrawalRequests) {
        firestoreData.withdrawalRequests = firestoreData.withdrawalRequests.map(cleanObject);
    }
    
    console.log('✅ Данные подготовлены для Firestore');
    return firestoreData;
}

// Функция для очистки старых base64 вложений (для экономии места)
function cleanupBase64Attachments() {
    console.log('🧹 Очистка старых base64 вложений...');
    let cleanedCount = 0;
    
    appData.tasks.forEach(task => {
        if (task.attachments && task.attachments.length > 0) {
            task.attachments = task.attachments.map(attachment => {
                // Если вложение уже загружено в Supabase, удаляем base64 данные
                if (attachment.url && attachment.data && attachment.data.startsWith('data:')) {
                    console.log(`🧹 Очищаем base64 для файла: ${attachment.fileName}`);
                    cleanedCount++;
                    
                    // Оставляем только метаданные Supabase
                    return {
                        type: attachment.type,
                        url: attachment.url,
                        fileName: attachment.fileName,
                        supabasePath: attachment.supabasePath,
                        uploadedAt: attachment.uploadedAt,
                        size: attachment.size
                        // Убираем attachment.data
                    };
                }
                return attachment;
            });
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`✅ Очищено ${cleanedCount} base64 вложений`);
        saveData(); // Сохраняем изменения
    }
}

// Дозагрузка выполненных заданий +5
let visibleTasks = 3;
let parentVisibleTasks = 3;

function showMoreTasks() {
    visibleTasks += 3;
    renderChildTasks();
}

function showMoreParentTasks() {
    parentVisibleTasks += 3;
    renderParentTasks();
}

// Показать уведомление об ошибке хранилища
function showStorageError() {
    alert('Недостаточно места для сохранения. Попробуйте удалить некоторые выполненные задания или уменьшить размер прикрепленных файлов.');
}

// Обновленная функция очистки хранилища - теперь чистит Supabase
async function cleanupStorage() {
    // Показываем диалог выбора типа очистки
    const cleanupType = await showCleanupDialog();
    
    if (!cleanupType) return; // Пользователь отменил
    
    console.log(`🧹 Начинаем очистку Supabase Storage: ${cleanupType}`);
    
    try {
        // Очищаем Supabase Storage в зависимости от выбора
        const deletedCount = await clearSupabaseStorage(cleanupType);
        
        // Также очищаем base64 вложения из локальных данных
        const localCleanedCount = cleanupLocalAttachments();
        
        // Сохраняем данные
        if (await saveData()) {
            let message = `✅ Очистка завершена!\n`;
            if (deletedCount > 0) {
                message += `🗑️ Удалено файлов из Supabase: ${deletedCount}\n`;
            }
            if (localCleanedCount > 0) {
                message += `🧹 Очищено base64 вложений: ${localCleanedCount}`;
            }
            if (deletedCount === 0 && localCleanedCount === 0) {
                message += 'Файлов для очистки не найдено.';
            }
            
            alert(message);
        } else {
            alert('❌ Ошибка при сохранении после очистки.');
        }
        
    } catch (error) {
        console.error('❌ Ошибка очистки хранилища:', error);
        alert('❌ Ошибка при очистке хранилища. Проверьте консоль для подробностей.');
    }
}

// Функция показа диалога выбора типа очистки
function showCleanupDialog() {
    return new Promise((resolve) => {
        // Создаем модальное окно выбора
        const dialogModal = document.createElement('div');
        dialogModal.className = 'modal';
        dialogModal.style.display = 'block';
        dialogModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <span class="close" onclick="closeCleanupDialog(null)">&times;</span>
                <h2>🗑️ Очистка базы данных</h2>
                <div style="text-align: center; margin: 20px 0;">
                    <p style="margin-bottom: 20px; color: var(--text-dark); font-size: 16px;">
                        Выберите тип очистки:
                    </p>
                    
                    <button onclick="closeCleanupDialog('all')" class="btn-reject" style="width: 100%; margin-bottom: 15px; padding: 15px; font-size: 16px;">
                        🗑️ Очистить ВСЕ файлы
                    </button>
                    
                    <button onclick="closeCleanupDialog('exceptAvatars')" class="btn-reject" style="width: 100%; background: var(--bg-terracotta); padding: 15px; font-size: 16px;">
                        🗑️ Очистить всё КРОМЕ аватаров
                    </button>
                    
                    <div style="margin-top: 20px; font-size: 12px; color: var(--text-light);">
                        <strong>ВСЕ файлы:</strong> удалит все фото, видео, голосовые сообщения и аватары<br>
                        <strong>Кроме аватаров:</strong> сохранит аватары, удалит остальные файлы
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialogModal);
        
        // Добавляем функцию закрытия в глобальную область видимости
        window.closeCleanupDialog = (result) => {
            if (dialogModal.parentNode) {
                dialogModal.parentNode.removeChild(dialogModal);
            }
            delete window.closeCleanupDialog;
            resolve(result);
        };
        
        // Закрытие по клику вне модального окна
        dialogModal.addEventListener('click', function(e) {
            if (e.target === dialogModal) {
                window.closeCleanupDialog(null);
            }
        });
    });
}

// Обновленная функция для очистки Supabase Storage
async function clearSupabaseStorage(mode = 'all') {
    if (!useSupabaseStorage) {
        console.log('📝 Supabase отключен, пропускаем очистку хранилища');
        return 0;
    }

    console.log(`🧹 Очищаем Supabase Storage: ${mode}`);
    
    try {
        // Получаем список всех файлов в bucket
        const { data: files, error } = await supabaseClient.storage
            .from('task-attachments')
            .list();
            
        if (error) {
            console.error('❌ Ошибка получения списка файлов:', error);
            throw error;
        }
        
        if (!files || files.length === 0) {
            console.log('✅ В Supabase нет файлов для удаления');
            return 0;
        }
        
        console.log(`📁 Найдено файлов в Supabase: ${files.length}`);
        
        // Фильтруем файлы в зависимости от режима
        let filesToRemove;
        if (mode === 'exceptAvatars') {
            // Удаляем все файлы, кроме аватаров
            filesToRemove = files
                .filter(file => !file.name.startsWith('avatar_'))
                .map(file => file.name);
            console.log(`📸 Сохраняем аватары, удаляем: ${filesToRemove.length} файлов`);
        } else {
            // Удаляем все файлы
            filesToRemove = files.map(file => file.name);
            console.log(`🗑️ Удаляем все: ${filesToRemove.length} файлов`);
        }
        
        if (filesToRemove.length === 0) {
            console.log('✅ Нет файлов для удаления в выбранном режиме');
            return 0;
        }
        
        // Удаляем файлы
        const { data: removeData, error: removeError } = await supabaseClient.storage
            .from('task-attachments')
            .remove(filesToRemove);
            
        if (removeError) {
            console.error('❌ Ошибка удаления файлов:', removeError);
            throw removeError;
        }
        
        console.log(`✅ Удалено файлов из Supabase: ${filesToRemove.length}`);
        return filesToRemove.length;
        
    } catch (error) {
        console.error('❌ Ошибка очистки Supabase:', error);
        throw error;
    }
}

// Функция для очистки base64 вложений из локальных данных
function cleanupLocalAttachments() {
    console.log('🧹 Очищаем base64 вложения из локальных данных...');
    let cleanedCount = 0;
    
    appData.tasks.forEach(task => {
        if (task.attachments && task.attachments.length > 0) {
            // Для заданий, у которых есть URL в Supabase, удаляем base64 данные
            task.attachments = task.attachments.map(attachment => {
                if (attachment.url && attachment.data && attachment.data.startsWith('data:')) {
                    console.log(`🧹 Очищаем base64 для файла: ${attachment.fileName}`);
                    cleanedCount++;
                    
                    // Оставляем только метаданные Supabase
                    return {
                        type: attachment.type,
                        url: attachment.url,
                        fileName: attachment.fileName,
                        supabasePath: attachment.supabasePath,
                        uploadedAt: attachment.uploadedAt,
                        size: attachment.size
                        // Убираем attachment.data
                    };
                }
                return attachment;
            });
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`✅ Очищено base64 вложений: ${cleanedCount}`);
    }
    
    return cleanedCount;
}

// Закрытие модального окна входа родителя
function closeParentModal() {
    const modal = getElement('parentLoginModal');
    const passwordInput = getElement('parentPassword');
    const errorEl = getElement('parentError');
    
    if (modal) modal.style.display = 'none';
    if (passwordInput) passwordInput.value = '';
    if (errorEl) errorEl.textContent = '';
}

// Вход родителя
async function loginParent() {
    const passwordInput = getElement('parentPassword');
    const errorEl = getElement('parentError');
    
    if (!passwordInput) return;
    
    const password = passwordInput.value;
    
    // Проверяем, есть ли хэш пароля или старый пароль
    if (appData.parentPasswordHash) {
        // Сравниваем хэши
        const inputHash = await hashPassword(password);
        if (inputHash === appData.parentPasswordHash) {
            // Сохраняем аутентификацию родителя
            sessionStorage.setItem('parentAuthenticated', 'true');
            window.location.href = 'parent.html';
            return;
        }
    } else if (appData.parentPassword) {
        // Проверяем старый пароль (для совместимости)
        if (password === appData.parentPassword) {
            // Конвертируем в хэш и сохраняем
            const newHash = await hashPassword(password);
            appData.parentPasswordHash = newHash;
            delete appData.parentPassword;
            
            // Сохраняем аутентификацию родителя
            sessionStorage.setItem('parentAuthenticated', 'true');
            window.location.href = 'parent.html';
            
            // Сохраняем данные с новым хэшем
            await saveData();
            return;
        }
    }
    
    // Если дошли сюда - пароль неверный
    if (errorEl) {
        errorEl.textContent = 'Неверный пароль!';
        errorEl.style.display = 'block';
    }
}

// Возврат на главную
function goHome() {
    if (confirm('Вернуться на главную страницу?')) {
        window.location.href = 'index.html';
    }
}

function initChildPage() {
    console.log('Инициализация страницы ребенка...');

    // Обновляем время последней активности
    appData.child.lastSeen = new Date().toISOString();
    saveData();
    
    // Проверяем все уведомления
    checkLevelUpNotification();
    checkMoneyUpNotification();
    checkWithdrawalResultNotifications();
    checkPiggyNotification();
    // Инициализируем UI
    updateChildHeader();
    renderChildTasks();
    updateChildStats();
    updatePiggyBankDisplay();
    initVoiceRecording();
    
    // setInterval УДАЛЕН - дублирует глобальную синхронизацию
}


function checkMoneyUpNotification() {
    if (appData.child.moneyUpNotification) {
        // Получаем сумму из sessionStorage или используем 100 по умолчанию
        const storedAmount = sessionStorage.getItem('moneyNotificationAmount');
        const amount = storedAmount ? parseInt(storedAmount) : 100;
        
        // Через 5 секунд (5000 миллисекунд) покажем уведомление
				setTimeout(() => {
				    showMoneyNotification(amount); 
				}, 5000);
        // Сбрасываем флаг после показа уведомления
        appData.child.moneyUpNotification = false;
        saveData();
    }
}

// Проверка результатов запросов на вывод для ребенка
function checkWithdrawalResultNotifications() {
    if (!window.location.pathname.includes('child.html')) return;

    const unnotifiedRequests = (appData.withdrawalRequests || [])
        .filter(r => (r.status === 'approved' || r.status === 'rejected') && !r.childNotified);

    if (unnotifiedRequests.length > 0) {
        // Берем самый свежий непросмотренный запрос
        const latest = unnotifiedRequests.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        showWithdrawalResultNotification(latest);

        // Помечаем как просмотренный
        latest.childNotified = true;
        saveData();
    }
}

// Показ уведомления ребенку о результате запроса на вывод
function showWithdrawalResultNotification(request) {
    const notification = document.createElement('div');
    notification.className = 'money-notification';

    let icon = '❌';
    let text = `Запрос на вывод ${request.amount}₽ отклонен.`;
    let subtext = 'Родитель отказался.';

    if (request.status === 'approved') {
        icon = '✅';
        text = `Запрос на вывод ${request.amount}₽ одобрен!`;
        subtext = 'Деньги скоро придут на карту.';
    }

    notification.innerHTML = `
        <div class="money-notification-content">
            <div class="money-icon">${icon}</div>
            <div class="money-text">${text}</div>
            <div class="money-subtext">${subtext}</div>
        </div>
    `;

    document.body.appendChild(notification);

    // Появление
    setTimeout(() => notification.classList.add('show'), 100);
    // Исчезновение через 5 секунд
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 5000);
}

// Проверка и отображение уведомления о повышении уровня
function checkLevelUpNotification() {
    if (appData.child.levelUpNotification) {
        showLevelUpCongratulations(appData.child.level);
        // Сбрасываем флаг после показа уведомления
        appData.child.levelUpNotification = false;
        saveData();
    }
}

// Поздравление с повышением уровня
function showLevelUpCongratulations(level) {
    const congratsHtml = `
        <div class="level-up-modal">
            <div class="level-up-content">
                <div class="level-up-icon">🎉</div>
                <h2>Поздравляем!</h2>
                <p>Ты достиг уровня <span class="level-number">${level}</span>!</p>
                <p>Это просто невероятно! Ты становишься лучше с каждым днем! 🌟</p>
                <button onclick="closeLevelUpModal()" class="btn-primary">Ура! Продолжить</button>
            </div>
        </div>
    `;
    
    // Добавляем стили для модального окна
    if (!document.querySelector('#levelUpStyles')) {
        const styles = document.createElement('style');
        styles.id = 'levelUpStyles';
        styles.textContent = `
            .level-up-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 3000;
                animation: fadeIn 0.5s ease;
            }
            .level-up-content {
                background: linear-gradient(135deg, #FFD700, #FFA500);
                padding: 40px;
                border-radius: 25px;
                text-align: center;
                border: 5px solid #FFF;
                box-shadow: 0 0 50px rgba(255,215,0,0.5);
                animation: bounceIn 0.8s ease;
                max-width: 400px;
                width: 90%;
            }
            .level-up-icon {
                font-size: 80px;
                margin-bottom: 20px;
                animation: pulse 2s infinite;
            }
            .level-up-content h2 {
                color: #8B4513;
                margin-bottom: 15px;
                font-size: 32px;
            }
            .level-up-content p {
                color: #8B4513;
                margin-bottom: 10px;
                font-size: 18px;
            }
            .level-number {
                font-size: 48px;
                font-weight: bold;
                color: #FF4500;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            @keyframes bounceIn {
                0% { transform: scale(0.3); opacity: 0; }
                50% { transform: scale(1.05); }
                70% { transform: scale(0.9); }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.insertAdjacentHTML('beforeend', congratsHtml);
}

function closeLevelUpModal() {
    const modal = document.querySelector('.level-up-modal');
    if (modal) {
        modal.remove();
    }
}

// Обновление шапки ребенка
function updateChildHeader() {
    const childName = getElement('childName');
    const childLevel = getElement('childLevel');
    const avatar = getElement('childAvatar');
    const fallback = getElement('avatarFallback');
    const badge = getElement('newTasksBadge');
    const count = getElement('newTasksCount');
    
    if (childName) childName.textContent = appData.child.name;
    if (childLevel) childLevel.textContent = appData.child.level;
    
    if (avatar && fallback) {
        if (!appData.child.avatar) {
            avatar.style.display = 'none';
            fallback.style.display = 'flex';
        } else {
            // ПРЕДЗАГРУЗКА АВАТАРКИ
            avatar.style.display = 'none';
            fallback.style.display = 'flex';
            
            const img = new Image();
            img.onload = () => {
                avatar.src = appData.child.avatar;
                avatar.style.display = 'block';
                fallback.style.display = 'none';
            };
            img.onerror = () => {
                // Оставляем fallback при ошибке
                console.warn('Аватарка не загрузилась');
            };
            img.src = appData.child.avatar;
        }
    }
    
    // Подсчет новых заданий (остается без изменений)
    const newTasksCount = appData.tasks.filter(t => 
        t.status === 'current' && !t.viewed
    ).length;
    
    if (badge && count) {
        if (newTasksCount > 0) {
            badge.style.display = 'block';
            count.textContent = newTasksCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

// Функция для нормализации даты
function normalizeDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Проверка, является ли дата задания будущей
function isTaskFuture(taskDate) {
    const taskDateNormalized = normalizeDate(taskDate);
    const todayNormalized = normalizeDate(new Date());
    return taskDateNormalized > todayNormalized;
}

// Отображение заданий ребенка
function renderChildTasks() {
    console.log('🔄 Обновление отображения заданий ребенка...');
    
    const now = new Date();
    const currentTasks = appData.tasks.filter(t => t.status === 'current')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const reviewTasks = appData.tasks.filter(t => t.status === 'review');
    const completedTasks = appData.tasks.filter(t => t.status === 'completed')
        .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
    
    const currentTasksEl = getElement('currentTasks');
    const reviewTasksEl = getElement('reviewTasks');
    const completedTasksEl = getElement('completedTasks');
    
    console.log(`📊 Статистика: текущие: ${currentTasks.length}, на проверке: ${reviewTasks.length}, выполненные: ${completedTasks.length}`);
    
    if (currentTasksEl) {
        currentTasksEl.innerHTML = currentTasks.map(task => 
            createTaskCard(task, now)
        ).join('');
    }
    
    if (reviewTasksEl) {
        reviewTasksEl.innerHTML = reviewTasks.map(task => 
            createTaskCard(task, now, 'review')
        ).join('');
    }
    
    if (completedTasksEl) {
        const completedToShow = completedTasks.slice(0, visibleTasks);
        completedTasksEl.innerHTML = completedToShow.map(task => 
            createTaskCard(task, now, 'completed')
        ).join('');
        
        const loadMoreBtn = getElement('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = completedTasks.length > visibleTasks ? 'block' : 'none';
        }
    }
    
    attachTaskCardListeners();
}

// Прикрепление обработчиков событий к карточкам заданий
function attachTaskCardListeners() {
    document.querySelectorAll('.task-card[data-task-id]').forEach(card => {
        const taskId = parseInt(card.getAttribute('data-task-id'));
        const isFuture = card.getAttribute('data-is-future') === 'true';
        
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        
        if (!isFuture) {
            newCard.addEventListener('click', function(e) {
                if (!e.target.closest('.new-badge') && !e.target.closest('.btn-edit-task') && !e.target.closest('.btn-delete-task')) {
                    openTask(taskId);
                }
            });
        }
    });
}

// Создание карточки задания (БЕЗОПАСНАЯ ВЕРСИЯ)
function createTaskCard(task, now, statusClass = '') {
    const isFuture = isTaskFuture(task.date);
    const isNew = !task.viewed && task.status === 'current';
    const needsRevision = task.needsRevision && task.status === 'current';
    const dateStr = new Date(task.date).toLocaleDateString('ru-RU');
    
    let classes = 'task-card';
    if (isNew) classes += ' new';
    if (isFuture) classes += ' future';
    if (needsRevision) classes += ' revision';
    if (statusClass) classes += ' ' + statusClass;
    
    const safeTitle = escapeHtml(task.title);
    const safeDescription = escapeHtml(task.description);
    const safeComment = task.parentComment ? escapeHtml(task.parentComment) : '';
    
    console.log(`🎯 Создание карточки: "${task.title}", статус: ${task.status}, ID: ${task.id}`);
    
    return `
        <div class="${classes}" data-task-id="${task.id}" data-is-future="${isFuture}">
            ${isNew ? '<span class="new-badge">NEW</span>' : ''}
            ${needsRevision ? '<span class="revision-badge">Доработать</span>' : ''}
            <div class="task-title">${safeTitle}</div>
            <div class="task-description">${safeDescription}</div>
            ${needsRevision && task.parentComment ? `<div class="parent-comment-preview">💬 Комментарий родителя: ${safeComment.substring(0, 50)}${safeComment.length > 50 ? '...' : ''}</div>` : ''}
            <div class="task-meta">
                <span>📅 ${dateStr}</span>
                <span class="task-points">⭐ ${task.points} баллов</span>
            </div>
        </div>
    `;
}


// Функция для удаления файлов из Supabase при удалении задания
async function deleteFromSupabase(fileName) {
    if (!useSupabaseStorage || !fileName) return;

    try {
        const { error } = await supabaseClient.storage
            .from('task-attachments')
            .remove([fileName]);

        if (error) {
            console.error('Ошибка удаления файла из Supabase:', error);
        }
    } catch (error) {
        console.error('Ошибка при удалении из Supabase:', error);
    }
}

// Обновите функцию удаления задания
async function deleteCompletedTask(taskId) {
    if (!confirm('Удалить это выполненное задание?')) {
        return;
    }

    const taskIndex = appData.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        const task = appData.tasks[taskIndex];
        
        // Удаляем вложения из Supabase
        if (task.attachments && task.attachments.length > 0) {
            for (const attachment of task.attachments) {
                if (attachment.fileName) {
                    await deleteFromSupabase(attachment.fileName);
                }
            }
        }
        
        appData.tasks.splice(taskIndex, 1);
        saveData();
        renderParentTasks();
        updateParentStats();
    }
}

// Открытие задания
let currentTaskId = null;
function openTask(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'current') return;
    
    if (isTaskFuture(task.date)) {
        return;
    }
    
    currentTaskId = taskId;
    
    const titleEl = getElement('taskModalTitle');
    const descEl = getElement('taskModalDescription');
    const dateEl = getElement('taskModalDate');
    const parentCommentEl = getElement('parentCommentDisplay');
    const answerEl = getElement('taskAnswer');
    const previewEl = getElement('attachmentPreview');
    const modal = getElement('taskModal');
    
    if (titleEl) titleEl.textContent = task.title;
    if (descEl) descEl.textContent = task.description;
    if (dateEl) dateEl.textContent = `Дата выполнения: ${new Date(task.date).toLocaleDateString('ru-RU')}`;
    
    if (task.needsRevision && task.parentComment) {
        if (parentCommentEl) {
            parentCommentEl.style.display = 'block';
            parentCommentEl.innerHTML = `
                <div class="parent-comment-box">
                    <div class="parent-comment-header">💬 Комментарий родителя:</div>
                    <div class="parent-comment-text">${escapeHtml(task.parentComment)}</div>
                </div>
            `;
        }
    } else {
        if (parentCommentEl) parentCommentEl.style.display = 'none';
    }
    
    if (answerEl) {
        answerEl.value = task.answer || '';
    }
    
    if (previewEl) {
        previewEl.innerHTML = '';
      if (task.attachments && task.attachments.length > 0) {
          task.attachments.forEach((attachment, index) => {
              if (attachment.type.startsWith('image/')) {
                  previewEl.innerHTML += `
                      <div class="attachment-item">
                          <img src="${attachment.data}" alt="Прикрепленное изображение ${index + 1}">
                          <button type="button" class="btn-remove-attachment" onclick="removeExistingAttachment(${index})">×</button>
                      </div>
                  `;
              } else if (attachment.type.startsWith('video/')) {
                  previewEl.innerHTML += `
                      <div class="attachment-item">
                          <video controls src="${attachment.data}"></video>
                          <button type="button" class="btn-remove-attachment" onclick="removeExistingAttachment(${index})">×</button>
                      </div>
                  `;
              } else if (attachment.type.startsWith('audio/')) {
                  previewEl.innerHTML += `
                      <div class="attachment-item">
                          <div class="audio-player">
                              <audio controls src="${attachment.data}"></audio>
                              <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">
                                  Голосовое сообщение
                              </div>
                          </div>
                          <button type="button" class="btn-remove-attachment" onclick="removeExistingAttachment(${index})">×</button>
                      </div>
                  `;
              }
          });
      }
    }
    
    if (modal) modal.style.display = 'block';
    
    task.viewed = true;
    saveData();
    updateChildHeader();
}

// Удаление существующего вложения
function removeExistingAttachment(index) {
    const task = appData.tasks.find(t => t.id === currentTaskId);
    if (!task) return;
    
    if (!task.attachments) return;
    
    task.attachments.splice(index, 1);
    saveData();
    
    // Обновляем превью
    const previewEl = getElement('attachmentPreview');
    if (previewEl) {
        previewEl.innerHTML = '';
        if (task.attachments.length > 0) {
            task.attachments.forEach((attachment, newIndex) => {
                if (attachment.type.startsWith('image/')) {
                    previewEl.innerHTML += `
                        <div class="attachment-item">
                            <img src="${attachment.data}" alt="Прикрепленное изображение ${newIndex + 1}">
                            <button type="button" class="btn-remove-attachment" onclick="removeExistingAttachment(${newIndex})">×</button>
                        </div>
                    `;
                } else if (attachment.type.startsWith('video/')) {
                    previewEl.innerHTML += `
                        <div class="attachment-item">
                            <video controls src="${attachment.data}"></video>
                            <button type="button" class="btn-remove-attachment" onclick="removeExistingAttachment(${newIndex})">×</button>
                        </div>
                    `;
                }
            });
        }
    }
}

// Закрытие модального окна задания
function closeTaskModal() {
    // Сбрасываем состояние UI при закрытии модального окна
    const submitBtn = document.querySelector('#taskModal .btn-primary');
    const interactiveElements = document.querySelectorAll('#taskModal input, #taskModal button, #taskModal textarea');
    
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '📤 Отправить на проверку';
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
    
    interactiveElements.forEach(el => {
        el.disabled = false;
        el.style.opacity = '1';
        el.style.cursor = 'pointer';
    });
    
    const modal = getElement('taskModal');
    const parentCommentEl = getElement('parentCommentDisplay');
    
    if (modal) modal.style.display = 'none';
    if (parentCommentEl) {
        parentCommentEl.style.display = 'none';
        parentCommentEl.innerHTML = '';
    }
    currentTaskId = null;
}

// Обработка прикрепления файла (множественные файлы)
function handleAttachment(input) {
    const preview = getElement('attachmentPreview');
    if (!preview) return;
    
    if (input.files && input.files.length > 0) {
        const files = Array.from(input.files);
        
        // Проверка общего размера файлов
        const totalSize = files.reduce((total, file) => total + file.size, 0);
        if (totalSize > 50 * 1024 * 1024) { // 5 файлов × 10 МБ = 50 МБ
            alert('Общий размер файлов слишком большой! Максимальный размер: 50 МБ');
            input.value = '';
            return;
        }
        
        // Ограничение на количество файлов
        if (files.length > 5) {
            alert('Можно прикрепить не более 5 файлов');
            input.value = '';
            return;
        }
        
        files.forEach((file, index) => {
            if (file.size > 40 * 1024 * 1024) { // 40 МБ на файл
                alert(`Файл "${file.name}" слишком большой! Максимальный размер: 40 МБ`);
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const attachmentItem = document.createElement('div');
                attachmentItem.className = 'attachment-item';
                
                if (file.type.startsWith('image/')) {
                    attachmentItem.innerHTML = `
                        <img src="${e.target.result}" alt="Прикрепленное изображение">
                        <button type="button" class="btn-remove-attachment" onclick="this.parentElement.remove()">×</button>
                    `;
                } else if (file.type.startsWith('video/')) {
                    attachmentItem.innerHTML = `
                        <video controls src="${e.target.result}"></video>
                        <button type="button" class="btn-remove-attachment" onclick="this.parentElement.remove()">×</button>
                    `;
                }
                
                preview.appendChild(attachmentItem);
            };
            
            reader.readAsDataURL(file);
        });
    }
}

// Получение всех прикрепленных файлов из превью
function getAttachmentsFromPreview() {
    const preview = getElement('attachmentPreview');
    if (!preview) return [];
    
    const attachments = [];
    const attachmentItems = preview.querySelectorAll('.attachment-item');
    
    attachmentItems.forEach(item => {
        const img = item.querySelector('img');
        const video = item.querySelector('video');
        
        if (img) {
            attachments.push({
                data: img.src,
                type: 'image/jpeg'
            });
        } else if (video) {
            attachments.push({
                data: video.src,
                type: 'video/mp4'
            });
        }
    });
    
    return attachments;
}

// Переменные для записи голоса
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let audioContext = null;
let analyser = null;
let animationFrame = null;

// Инициализация записи голоса
function initVoiceRecording() {
    const recordButton = getElement('recordButton');
    const stopButton = getElement('stopButton');
    
    if (recordButton) {
        recordButton.addEventListener('click', startRecording);
    }
    if (stopButton) {
        stopButton.addEventListener('click', stopRecording);
    }
}

// Начать запись
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            displayAudioPreview(audioUrl, audioBlob);
            
            // Останавливаем все треки
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        startRecordingTimer();
        updateRecordingUI(true);
        
        // Визуализатор звука
        initAudioVisualizer(stream);
        
    } catch (error) {
        console.error('Ошибка записи:', error);
        alert('Не удалось начать запись. Проверьте разрешение на использование микрофона.');
    }
}

// Визуализатор звука
function initAudioVisualizer(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function updateVisualizer() {
        if (!analyser) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        const progress = (average / 256) * 100;
        
        const progressBar = getElement('recordingProgress');
        if (progressBar) {
            progressBar.style.width = Math.min(progress, 100) + '%';
        }
        
        animationFrame = requestAnimationFrame(updateVisualizer);
    }
    
    updateVisualizer();
}

// Остановить запись
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        stopRecordingTimer();
        updateRecordingUI(false);
        
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
    }
}

// Таймер записи
function startRecordingTimer() {
    recordingSeconds = 0;
    const timerDisplay = getElement('timerDisplay');
    
    recordingTimer = setInterval(() => {
        recordingSeconds++;
        const minutes = Math.floor(recordingSeconds / 60);
        const seconds = recordingSeconds % 60;
        
        if (timerDisplay) {
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Автоостановка через 2 минуты
        if (recordingSeconds >= 120) {
            stopRecording();
        }
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

// Обновление UI при записи
function updateRecordingUI(isRecording) {
    const recordButton = getElement('recordButton');
    const stopButton = getElement('stopButton');
    const timer = getElement('recordingTimer');
    const visualizer = getElement('recordingVisualizer');
    
    if (recordButton) recordButton.style.display = isRecording ? 'none' : 'block';
    if (stopButton) stopButton.style.display = isRecording ? 'block' : 'none';
    if (timer) timer.style.display = isRecording ? 'block' : 'none';
    if (visualizer) visualizer.style.display = isRecording ? 'block' : 'none';
}

// Показ превью аудио
async function displayAudioPreview(audioUrl, audioBlob) {
    const voicePreview = getElement('voicePreview');
    if (!voicePreview) return;
    
    // Конвертируем Blob в Base64 для постоянного хранения
    const base64Data = await blobToBase64(audioBlob);
    
    voicePreview.innerHTML = `
        <div class="attachment-item">
            <div class="audio-player">
                <audio controls src="${audioUrl}"></audio>
                <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">
                    Длительность: ${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}
                </div>
            </div>
            <button type="button" class="btn-remove-attachment" onclick="removeVoiceAttachment()">×</button>
        </div>
    `;
    
    // Сохраняем Base64 данные
    sessionStorage.setItem('currentAudioAttachment', JSON.stringify({
        data: base64Data,        // ← Сохраняем как Base64
        type: 'audio/wav',
        duration: recordingSeconds
    }));
}

// Добавьте функцию конвертации Blob в Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Убираем префикс "data:audio/wav;base64,"
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Удаление голосового сообщения
function removeVoiceAttachment() {
    const voicePreview = getElement('voicePreview');
    if (voicePreview) {
        voicePreview.innerHTML = '';
    }
    sessionStorage.removeItem('currentAudioAttachment');
}

// Получение голосового вложения
function getVoiceAttachment() {
    const voiceData = sessionStorage.getItem('currentAudioAttachment');
    if (!voiceData) return null;
    
    const attachmentData = JSON.parse(voiceData);
    
    // Восстанавливаем из Base64 в data URL
    if (attachmentData.data && !attachmentData.data.startsWith('blob:')) {
        return {
            data: `data:audio/wav;base64,${attachmentData.data}`,
            type: 'audio/wav',
            duration: attachmentData.duration
        };
    }
    
    return attachmentData;
}

// Отправка задания на проверку
async function submitTask() {
    if (isSubmittingTask) {
        console.log('⚠️ Задание уже отправляется, ждите...');
        return;
    }
    // Проверяем подключение
    if (!navigator.onLine || !currentUser) {
        alert('❌ Нет подключения к интернету. Невозможно отправить задание.');
        return;
    }

    isSubmittingTask = true;
    console.log('🔄 Отправка задания...');
    
    // Получаем кнопку отправки
    const submitBtn = document.querySelector('#taskModal .btn-primary');
    const originalText = submitBtn ? submitBtn.innerHTML : '📤 Отправить на проверку';
    
    // Блокируем кнопку и меняем текст
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ <span class="loading-dots">Отправляется</span>';
        submitBtn.style.opacity = '0.7';
    }
    
    // Блокируем все интерактивные элементы
    const interactiveElements = document.querySelectorAll('#taskModal input, #taskModal button, #taskModal textarea');
    interactiveElements.forEach(el => {
        if (el !== submitBtn) {
            el.disabled = true;
            el.style.opacity = '0.5';
        }
    });

    try {
        const task = appData.tasks.find(t => t.id === currentTaskId);
        if (!task) {
            throw new Error('Задание не найдено');
        }

        console.log('📝 Исходный статус задания:', task.status);

        const answerEl = getElement('taskAnswer');
        if (!answerEl) {
            throw new Error('Элемент ответа не найден');
        }

        const answer = answerEl.value.trim();
        const newAttachments = getAttachmentsFromPreview();
        const voiceAttachment = getVoiceAttachment();

        // Проверяем, есть ли хоть что-то
        if (!answer && newAttachments.length === 0 && !voiceAttachment) {
            throw new Error('Пожалуйста, напишите ответ, прикрепите файл или запишите голосовое сообщение!');
        }

        // Обновляем статус задания
        task.answer = answer;
        task.status = 'review';
        task.submittedDate = new Date().toISOString();
        task.needsRevision = false;
        task.parentComment = null;

        console.log('📝 Новый статус задания:', task.status);

        // Обрабатываем вложения
        task.attachments = [];

        // Загружаем обычные вложения
        for (let i = 0; i < newAttachments.length; i++) {
            if (submitBtn) {
                submitBtn.innerHTML = `⏳ <span class="loading-dots">Загружаем файл ${i + 1}/${newAttachments.length}</span>`;
            }

            const attachment = newAttachments[i];
            console.log(`📤 Загрузка вложения ${i + 1}/${newAttachments.length}`);
            
            const result = await uploadToSupabase(attachment, task.id);
            
            if (result && typeof result === 'object') {
                task.attachments.push(result);
                console.log(`✅ Вложение ${i + 1} обработано`);
            } else {
                console.warn(`⚠️ Вложение ${i + 1} не загружено в Supabase, используем base64`);
                task.attachments.push(attachment);
            }
        }

        // Загружаем голосовое сообщение
        if (voiceAttachment) {
            if (submitBtn) {
                submitBtn.innerHTML = '⏳ <span class="loading-dots">Загружаем голосовое сообщение</span>';
            }

            const voiceResult = await uploadToSupabase(voiceAttachment, task.id, 'voice');
            
            if (voiceResult && typeof voiceResult === 'object') {
                task.attachments.push(voiceResult);
            } else {
                task.attachments.push(voiceAttachment);
            }
            removeVoiceAttachment();
        }

        console.log('✅ Все вложения обработаны:', task.attachments);

        // Фильтруем undefined значения
        task.attachments = task.attachments.filter(attachment => 
            attachment !== undefined && attachment !== null
        );

        // Сохраняем данные
        if (submitBtn) {
            submitBtn.innerHTML = '⏳ <span class="loading-dots">Сохраняем данные</span>';
        }

        const saved = await saveData();
        
        if (!saved) {
            throw new Error('Ошибка сохранения данных');
        }

        console.log('✅ Задание успешно отправлено и сохранено');
        
        // ВОССТАНАВЛИВАЕМ UI ПЕРЕД закрытием модального окна
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            submitBtn.style.opacity = '1';
        }
        
        interactiveElements.forEach(el => {
            el.disabled = false;
            el.style.opacity = '1';
        });

        // Закрываем модальное окно и обновляем UI
        closeTaskModal();
        
        // Принудительно обновляем данные локально, чтобы синхронизация не перезаписала
        await forceUpdateLocalData();
        
        renderChildTasks(); // ← ВАЖНО: обновляем отображение заданий
        updateChildStats(); // ← Обновляем статистику
        updateChildHeader(); // ← Обновляем шапку
        
        alert('✅ Задание отправлено на проверку!');

    } catch (error) {
        console.error('❌ Ошибка при отправке задания:', error);
        
        // Восстанавливаем UI при ошибке
        const submitBtn = document.querySelector('#taskModal .btn-primary');
        const interactiveElements = document.querySelectorAll('#taskModal input, #taskModal button, #taskModal textarea');
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '📤 Отправить на проверку';
            submitBtn.style.opacity = '1';
        }
        
        interactiveElements.forEach(el => {
            el.disabled = false;
            el.style.opacity = '1';
        });

        if (error.message.includes('Пожалуйста')) {
            alert(error.message);
        } else {
            alert('❌ Ошибка при отправке задания. Попробуйте еще раз.');
        }
    } finally {
        isSubmittingTask = false;
    }
}

// Добавьте функцию для принудительного обновления локальных данных
async function forceUpdateLocalData() {
    console.log('🔄 Принудительное обновление локальных данных...');
    
    // Сохраняем текущие данные в localStorage
    localStorage.setItem('appData', JSON.stringify(appData));
    
    // Временно отключаем синхронизацию
    const tempIsSyncing = isSyncing;
    isSyncing = true;
    
    // Ждем немного, чтобы синхронизация завершилась
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Восстанавливаем флаг синхронизации
    isSyncing = tempIsSyncing;
    
    console.log('✅ Локальные данные обновлены');
}

// Функция для восстановления UI состояния
function resetUIState(submitBtn, originalText, interactiveElements) {
    // Восстанавливаем кнопку отправки
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
    
    // Разблокируем все элементы
    if (interactiveElements) {
        interactiveElements.forEach(el => {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.cursor = 'pointer';
        });
    }
}

// Обновление статистики ребенка
function updateChildStats() {
    const completed = appData.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = appData.tasks.length;
    const totalPoints = appData.child.points;
    const level = appData.child.level;
    
    const completedEl = getElement('totalCompleted');
    const pointsEl = getElement('totalPoints');
    const levelEl = getElement('currentLevel');
    
    if (completedEl) completedEl.textContent = completed;
    if (pointsEl) pointsEl.textContent = totalPoints;
    if (levelEl) levelEl.textContent = level;
    
}

// Настройки ребенка
let uploadedAvatarData = null;

function openChildSettings() {
    const nameInput = getElement('settingsName');
    const avatarInput = getElement('settingsAvatar');
    const fileInput = getElement('avatarFileInput');
    const preview = getElement('avatarPreview');
    const placeholder = getElement('avatarPreviewPlaceholder');
    const modal = getElement('settingsModal');
    
    if (!nameInput || !modal) return;
    
    nameInput.value = appData.child.name;
    if (avatarInput) avatarInput.value = '';
    if (fileInput) fileInput.value = '';
    uploadedAvatarData = null;
    
    if (preview && placeholder) {
        if (appData.child.avatar) {
            preview.src = appData.child.avatar;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            preview.style.display = 'none';
            placeholder.style.display = 'flex';
        }
    }
    
    modal.style.display = 'block';
}

function closeSettingsModal() {
    const modal = getElement('settingsModal');
    const fileInput = getElement('avatarFileInput');
    
    if (modal) modal.style.display = 'none';
    if (fileInput) fileInput.value = '';
    uploadedAvatarData = null;
}

function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения!');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5 МБ!');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedAvatarData = e.target.result;
        const preview = getElement('avatarPreview');
        const placeholder = getElement('avatarPreviewPlaceholder');
        const avatarInput = getElement('settingsAvatar');
        
        if (preview && placeholder) {
            preview.src = uploadedAvatarData;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        }
        
        if (avatarInput) avatarInput.value = '';
    };
    reader.readAsDataURL(file);
}

function loadAvatarFromUrl() {
    const avatarInput = getElement('settingsAvatar');
    if (!avatarInput) return;
    
    const url = avatarInput.value.trim();
    if (!url) {
        alert('Введите URL изображения!');
        return;
    }
    
    const preview = getElement('avatarPreview');
    const placeholder = getElement('avatarPreviewPlaceholder');
    
    if (!preview || !placeholder) return;
    
    const img = new Image();
    img.onload = function() {
        uploadedAvatarData = url;
        preview.src = url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    };
    img.onerror = function() {
        alert('Не удалось загрузить изображение по указанному URL. Проверьте правильность ссылки.');
    };
    img.src = url;
}

async function saveChildSettings() {
    const nameInput = getElement('settingsName');
    const avatarInput = getElement('settingsAvatar');
    
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    
    if (name) {
        appData.child.name = name;
    }
    
    // ОБРАБОТКА АВАТАРА
    if (uploadedAvatarData) {
        try {
            // Загружаем аватар в Supabase
            const supabaseAvatar = await uploadAvatarToSupabase(uploadedAvatarData);
            if (supabaseAvatar) {
                appData.child.avatar = supabaseAvatar.url; // Сохраняем URL
                console.log('✅ Аватар загружен в Supabase');
            } else {
                // Fallback: сохраняем base64
                appData.child.avatar = uploadedAvatarData;
                console.log('⚠️ Аватар сохранен как base64');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки аватара:', error);
            appData.child.avatar = uploadedAvatarData; // Fallback
        }
    } else {
        if (avatarInput) {
            const avatarUrl = avatarInput.value.trim();
            if (avatarUrl) {
                appData.child.avatar = avatarUrl;
            }
        }
    }
    
    saveData();
    updateChildHeader();
    closeSettingsModal();
}

// Функция загрузки аватара в Supabase
async function uploadAvatarToSupabase(avatarData) {
    if (!useSupabaseStorage) {
        return null;
    }

    try {
        // Создаем уникальное имя файла
        const fileName = `avatar_${appData.child.name}_${Date.now()}.jpg`;
        
        // Конвертируем base64 в Blob
        let fileBlob;
        if (avatarData.startsWith('data:')) {
            fileBlob = dataURLtoBlob(avatarData);
        } else {
            return null; // Если не base64, возвращаем null
        }

        // Загружаем в Supabase
        const { data, error } = await supabaseClient.storage
            .from('task-attachments') // Используем тот же bucket
            .upload(fileName, fileBlob, {
                cacheControl: '3600',
                upsert: true // Разрешаем перезапись
            });

        if (error) {
            console.error('❌ Ошибка загрузки аватара в Supabase:', error);
            return null;
        }

        // Получаем публичный URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('task-attachments')
            .getPublicUrl(fileName);

        return {
            url: publicUrl,
            fileName: fileName,
            supabasePath: data.path,
            uploadedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('❌ Ошибка при загрузке аватара:', error);
        return null;
    }
}

// Функции для копилки
function initPiggyBank() {
    updatePiggyBankDisplay();
}

// Обновление отображения копилки
function updatePiggyBankDisplay() {
    const piggyBankFill = getElement('piggyBankFill');
    const piggyBankAmount = getElement('piggyBankAmount');
    const piggyBankCoins = getElement('piggyBankCoins');
    
    if (!piggyBankFill || !piggyBankAmount) return;
    
    const currentAmount = appData.child.piggyBankAmount || 0;
    const progress = Math.min((currentAmount / 1000) * 100, 100);
    
    piggyBankFill.style.height = progress + '%';
    piggyBankAmount.textContent = `${currentAmount}₽`;
    
    // Обновляем количество монеток
    if (piggyBankCoins) {
        const coinsCount = Math.min(Math.floor(currentAmount / 10), 20);
        piggyBankCoins.innerHTML = '';
        
        for (let i = 0; i < coinsCount; i++) {
            const coin = document.createElement('div');
            coin.className = 'piggy-coin';
            coin.style.left = `${10 + (i % 5) * 15}%`;
            coin.style.bottom = `${15 + Math.floor(i / 5) * 12}%`;
            coin.style.animationDelay = `${i * 0.2}s`;
            coin.textContent = '🪙';
            piggyBankCoins.appendChild(coin);
        }
    }
}

// Функции для управления копилкой
function openManagePiggyModal() {
    const modal = getElement('managePiggyModal');
    const amountInput = getElement('piggyAmountChange');
    const previewEl = getElement('newAmountPreview');
    
    if (!modal || !amountInput) return;
    
    const currentAmount = appData.child.piggyBankAmount || 0;
    currentPiggyChange = 0;
    
    // Устанавливаем текущую сумму в поле ввода
    amountInput.value = currentAmount;
    updateAmountPreview();
    
    modal.style.display = 'block';
    modal.style.zIndex = '9999';
}

function closeManagePiggyModal() {
    const modal = getElement('managePiggyModal');
    const commentInput = getElement('piggyComment');
    
    if (modal) modal.style.display = 'none';
    if (commentInput) commentInput.value = '';
    currentPiggyChange = 0;
}

function changeAmount(delta) {
    const amountInput = getElement('piggyAmountChange');
    if (!amountInput) return;
    
    let newValue = parseInt(amountInput.value) + delta;
    // Не позволяем уходить в отрицательные значения
    newValue = Math.max(0, newValue);
    
    amountInput.value = newValue;
    updateAmountPreview();
}

function updateAmountPreview() {
    const previewEl = getElement('newAmountPreview');
    const amountInput = getElement('piggyAmountChange');
    
    if (!previewEl || !amountInput) return;
    
    const newAmount = parseInt(amountInput.value) || 0;
    const currentAmount = appData.child.piggyBankAmount || 0;
    const difference = newAmount - currentAmount;
    
    previewEl.textContent = newAmount + '₽';
    
    // Подсвечиваем изменение цвета
    if (difference > 0) {
        previewEl.style.color = '#4CAF50';
        previewEl.innerHTML = newAmount + '₽ <span style="font-size: 16px; opacity: 0.8;">(+' + difference + '₽)</span>';
    } else if (difference < 0) {
        previewEl.style.color = '#F44336';
        previewEl.innerHTML = newAmount + '₽ <span style="font-size: 16px; opacity: 0.8;">(' + difference + '₽)</span>';
    } else {
        previewEl.style.color = 'var(--text-dark)';
        previewEl.textContent = newAmount + '₽';
    }
}

function savePiggyChanges() {
    const commentInput = getElement('piggyComment');
    const amountInput = getElement('piggyAmountChange');
    const comment = commentInput ? commentInput.value.trim() : '';
    const currentAmount = appData.child.piggyBankAmount || 0;
    const newAmount = parseInt(amountInput.value) || 0;
    
    if (newAmount === currentAmount) {
        alert('Сумма не изменена!');
        return;
    }
    
    if (newAmount < 0) {
        alert('Сумма не может быть отрицательной!');
        return;
    }
    
    const difference = newAmount - currentAmount;
    
    // Сохраняем изменение
    appData.child.piggyBankAmount = newAmount;
    
    // Создаем уведомление для ребенка
    const notification = {
        id: Date.now(),
        type: difference > 0 ? 'money_added' : 'money_removed',
        amount: Math.abs(difference),
        comment: comment,
        date: new Date().toISOString(),
        viewed: false
    };
    
    // Добавляем в историю уведомлений
    if (!appData.piggyNotifications) {
        appData.piggyNotifications = [];
    }
    appData.piggyNotifications.push(notification);
    
    // Устанавливаем флаг для показа уведомления ребенку
    appData.child.piggyNotification = true;
    
    saveData().then(() => {
        updateParentPiggyInfo();
        closeManagePiggyModal();
        
        const changeText = difference > 0 ? `+${difference}₽` : `${difference}₽`;
        alert(`✅ Сумма в копилке изменена на ${changeText}! Новая сумма: ${newAmount}₽`);
    });
}

// Функция для проверки уведомлений о копилке у ребенка
function checkPiggyNotification() {
    if (appData.child.piggyNotification && appData.piggyNotifications && appData.piggyNotifications.length > 0) {
        // Находим последнее непросмотренное уведомление
        const lastNotification = appData.piggyNotifications
            .filter(n => !n.viewed)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        
        if (lastNotification) {
            showPiggyNotification(lastNotification);
            lastNotification.viewed = true;
            appData.child.piggyNotification = false;
            saveData();
        }
    }
}

// Функция показа уведомления о копилке ребенку
function showPiggyNotification(notification) {
    const isAdded = notification.type === 'money_added';
    const bgColor = isAdded ? 'var(--sticky-green)' : 'var(--sticky-blue)';
    const icon = isAdded ? '💰' : '💸';
    const title = isAdded ? 'Пополнение копилки!' : 'Списание из копилки';
    
    const notificationHtml = `
        <div class="money-notification">
            <div class="money-notification-content" style="background: ${bgColor};">
                <div class="money-icon">${icon}</div>
                <div class="money-text">${title}</div>
                <div class="money-amount ${isAdded ? 'positive' : 'negative'}">
                    ${isAdded ? '+' : '-'}${notification.amount}₽
                </div>
                ${notification.comment ? `
                    <div class="money-comment">
                        <div class="comment-text">${escapeHtml(notification.comment)}</div>
                    </div>
                ` : ''}
                <button onclick="closePiggyNotification()" class="btn-primary" style="margin-top: 15px; background: var(--bg-button); border: 2px solid var(--wood-border); color: var(--text-dark);">OK</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', notificationHtml);
    
    // Анимация появления
    setTimeout(() => {
        const notificationEl = document.querySelector('.money-notification');
        if (notificationEl) {
            notificationEl.classList.add('show');
        }
    }, 100);
}

function closePiggyNotification() {
    const notification = document.querySelector('.money-notification');
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }
}

// Показ уведомления о начислении денег
function showMoneyNotification(amount) {
    // Пытаемся получить сумму из sessionStorage (для случаев повышения на несколько уровней)
    const storedAmount = sessionStorage.getItem('moneyNotificationAmount');
    const finalAmount = storedAmount ? parseInt(storedAmount) : amount;
    
    // Очищаем хранилище
    sessionStorage.removeItem('moneyNotificationAmount');
    
    const notification = document.createElement('div');
    notification.className = 'money-notification';
    notification.innerHTML = `
        <div class="money-notification-content">
            <div class="money-icon">💰</div>
            <div class="money-text">+${finalAmount}₽ в копилку!</div>
            <div class="money-subtext">За достижение нового уровня!</div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления и исчезновения
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 3000);
}

// Запрос на вывод денег
function requestWithdrawal() {
    const currentAmount = appData.child.piggyBankAmount || 0;
    
    // Проверяем есть ли уже активный запрос
    const pendingRequest = (appData.withdrawalRequests || []).find(r => r.status === 'pending');
    if (pendingRequest) {
        alert('Запрос на вывод уже отправлен! Ожидайте подтверждения от родителя.');
        return;
    }
    
    if (currentAmount <= 0) {
        alert('В копилке нет денег для вывода!');
        return;
    }
    
    if (!confirm(`Запросить вывод ${currentAmount}₽ из копилки? Родитель получит уведомление.`)) {
        return;
    }
    
    // Создаем запрос на вывод
    const withdrawalRequest = {
        id: Date.now(),
        amount: currentAmount,
        date: new Date().toISOString(),
        status: 'pending',
        childName: appData.child.name,
        viewedByParent: false,
        childNotified: false
    };
    
    appData.withdrawalRequests = appData.withdrawalRequests || [];
    appData.withdrawalRequests.push(withdrawalRequest);
    
    saveData();
    
    // Обновляем label копилки
    const label = getElement('piggyBankLabel');
    if (label) {
        label.textContent = 'Запрос отправлен ✓';
        label.style.color = '#4CAF50';
    }
    
    alert(`Запрос на вывод ${currentAmount}₽ отправлен родителю! Ожидайте подтверждения.`);
}

// Для родителя: подтверждение вывода
function approveWithdrawal(requestId) {
    const request = appData.withdrawalRequests.find(r => r.id === requestId);
    if (!request) return;
    
    request.status = 'approved';
    request.approvedDate = new Date().toISOString();
    
    // Обнуляем копилку ребенка
    appData.child.piggyBankAmount = 0;
    request.childNotified = false; // ← ребенок еще не видел уведомление
    
    saveData();
    updateParentPiggyInfo();
    renderWithdrawalRequests();
    
    // Сбрасываем label копилки у ребенка
    // Это обновится при следующей загрузке страницы ребенком
    
    alert(`Вывод ${request.amount}₽ подтвержден! Деньги выданы ребенку.`);
}

// Проверка новых запросов для родителя
function checkWithdrawalNotifications() {
    if (!window.location.pathname.includes('parent.html')) return;
    
    const newRequests = (appData.withdrawalRequests || [])
        .filter(r => r.status === 'pending' && !r.viewedByParent);
    
    if (newRequests.length > 0) {
        showWithdrawalNotification(newRequests[0]);
        // Помечаем как просмотренные
        newRequests.forEach(request => {
            request.viewedByParent = true;
        });
        saveData();
    }
}

// Уведомление о новом запросе для родителя
function showWithdrawalNotification(request) {
    const notification = document.createElement('div');
    notification.className = 'money-notification';
    notification.innerHTML = `
        <div class="money-notification-content">
            <div class="money-icon">💸</div>
            <div class="money-text">Новый запрос на вывод!</div>
            <div class="money-subtext">${request.childName} просит ${request.amount}₽</div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Автоматически закрываем через 4 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 4000);
}


// Для родителя: отмена вывода
function rejectWithdrawal(requestId) {
    const request = appData.withdrawalRequests.find(r => r.id === requestId);
    if (!request) return;
    
    request.status = 'rejected';
		request.rejectedDate = new Date().toISOString();
    request.childNotified = false; // ← ребенок еще не видел уведомление
    
    saveData();
    renderWithdrawalRequests();
    
    alert(`Запрос на вывод ${request.amount}₽ отклонен.`);
}

// Отображение запросов на вывод для родителя
function renderWithdrawalRequests() {
    const requestsContainer = getElement('withdrawalRequests');
    if (!requestsContainer) return;
    
    const pendingRequests = (appData.withdrawalRequests || [])
        .filter(r => r.status === 'pending')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (pendingRequests.length === 0) {
        requestsContainer.innerHTML = '<div class="no-requests">Нет активных запросов на вывод</div>';
        return;
    }
    
    requestsContainer.innerHTML = pendingRequests.map(request => `
        <div class="withdrawal-request-card">
            <div class="request-header">
                <div class="request-amount">${request.amount}₽</div>
                <div class="request-date">${new Date(request.date).toLocaleDateString('ru-RU')}</div>
            </div>
            <div class="request-child">От: ${escapeHtml(request.childName)}</div>
            <div class="request-actions">
                <button class="btn-approve" onclick="approveWithdrawal(${request.id})">✅ Выдать</button>
                <button class="btn-reject" onclick="rejectWithdrawal(${request.id})">❌ Отклонить</button>
            </div>
        </div>
    `).join('');
}

// Инициализация страницы родителя
function initParentPage() {
    console.log('Инициализация страницы родителя...');
    updateParentHeader();
    renderParentTasks();
    updateParentStats();
    updateParentPiggyInfo();
    renderWithdrawalRequests();
    checkWithdrawalNotifications();
}

// Обновление шапки родителя
function updateParentHeader() {
    const reviewCount = appData.tasks.filter(t => t.status === 'review').length;
    const reviewCountEl = getElement('reviewCount');
    const statusEl = getElement('childStatus');

    if (reviewCountEl) reviewCountEl.textContent = reviewCount;

    // Показываем последнюю активность ребенка (когда он заходил на свою страницу)
    if (statusEl) {
        if (appData.child.lastSeen) {
            const date = new Date(appData.child.lastSeen);
            const formatted =
                date.toLocaleDateString('ru-RU') +
                " " +
                date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            statusEl.textContent = `${formatted}`;
            statusEl.className = 'status-value online';
        } else {
            statusEl.textContent = "Давно";
            statusEl.className = 'status-value offline';
        }
    }
}



// Отображение заданий родителя
function renderParentTasks() {
    const reviewTasks = appData.tasks.filter(t => t.status === 'review');
    const currentTasks = appData.tasks.filter(t => t.status === 'current')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const completedTasks = appData.tasks.filter(t => t.status === 'completed')
        .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
    
    const reviewEl = getElement('parentReviewTasks');
    const currentEl = getElement('parentCurrentTasks');
    const completedEl = getElement('parentCompletedTasks');
    
    if (reviewEl) {
        reviewEl.innerHTML = reviewTasks.map(task => 
            createParentTaskCard(task, 'review')
        ).join('');
    }
    
    if (currentEl) {
        currentEl.innerHTML = currentTasks.map(task => 
            createParentTaskCard(task, 'current')
        ).join('');
    }
    
    if (completedEl) {
        // ОГРАНИЧИВАЕМ количество отображаемых заданий
        const completedToShow = completedTasks.slice(0, parentVisibleTasks);
        completedEl.innerHTML = completedToShow.map(task => 
            createParentTaskCard(task, 'completed')
        ).join('');
        
        // ПОКАЗЫВАЕМ/СКРЫВАЕМ КНОПКУ
        const parentLoadMoreBtn = getElement('parentLoadMoreBtn');
        if (parentLoadMoreBtn) {
            if (completedTasks.length > parentVisibleTasks) {
                parentLoadMoreBtn.style.display = 'block';
            } else {
                parentLoadMoreBtn.style.display = 'none';
            }
        }
    }
    
    updateParentStats();
}

// Создание карточки задания для родителя (БЕЗОПАСНАЯ ВЕРСИЯ)
function createParentTaskCard(task, statusClass) {
    const dateStr = new Date(task.date).toLocaleDateString('ru-RU');
    let classes = 'task-card parent-task-card';
    if (statusClass) classes += ' ' + statusClass;
    
    let onClick = '';
    if (statusClass === 'review') {
        onClick = `onclick="openReviewTask(${task.id})"`;
    }
    
    const canEdit = statusClass === 'current';
    const canDelete = statusClass === 'completed';
    const safeTitle = escapeHtml(task.title);
    const safeDescription = escapeHtml(task.description);
    
    // ИНФОРМАЦИЯ О ВЛОЖЕНИЯХ
    const attachmentsInfo = task.attachments && task.attachments.length > 0 ? 
        `<div class="attachments-badge" title="${task.attachments.length} прикрепленных файлов">📎 ${task.attachments.length}</div>` : '';
        
    return `
        <div class="${classes}" data-task-id="${task.id}" ${onClick}>
            ${attachmentsInfo}
            <div class="task-title">${safeTitle}</div>
            <div class="task-description">${safeDescription}</div>
            <div class="task-meta">
                <span>📅 ${dateStr}</span>
                <span class="task-points">⭐ ${task.points} баллов</span>
            </div>
            ${canEdit ? `<button class="btn-edit-task" onclick="event.stopPropagation(); openEditTaskModal(${task.id})" title="Редактировать">✏️</button>` : ''}
            ${canDelete ? `<button class="btn-delete-task" onclick="event.stopPropagation(); deleteCompletedTask(${task.id})" title="Удалить">🗑️</button>` : ''}
        </div>
    `;
}

// Функция для проверки доступности файла в Supabase
async function checkFileAvailability(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.error('❌ Файл недоступен:', url, error);
        return false;
    }
}

// Функция для отображения вложений с проверкой доступности
async function displayAttachmentsWithCheck(attachments, container) {
    if (!attachments || attachments.length === 0) {
        container.innerHTML = '<div class="no-attachments">Нет прикрепленных файлов</div>';
        return;
    }
    
    let html = '';
    
    for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i];
        let mediaSrc = attachment.url || attachment.data;
        
        if (!mediaSrc) {
            console.error('❌ Вложение без данных:', attachment);
            continue;
        }
        
        // Для Supabase URL проверяем доступность
        if (attachment.url) {
            const isAvailable = await checkFileAvailability(attachment.url);
            if (!isAvailable) {
                console.warn('⚠️ Файл недоступен:', attachment.url);
                html += `
                    <div class="attachment-item">
                        <div style="text-align: center; color: var(--error); padding: 20px;">
                            ❌ Файл недоступен: ${attachment.fileName || 'неизвестный файл'}
                        </div>
                    </div>
                `;
                continue;
            }
        }
        
        // СОЗДАЕМ HTML ДЛЯ ДОСТУПНОГО ВЛОЖЕНИЯ
        if (attachment.type.startsWith('image/')) {
            html += `
                <div class="attachment-item">
                    <img src="${mediaSrc}" alt="Изображение ${i + 1}" 
                         onclick="openFullscreenImage('${mediaSrc}')" 
                         style="cursor: pointer; max-width: 300px; max-height: 300px;"
                         onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'text-align:center;color:var(--error);padding:20px;\\'>❌ Ошибка загрузки изображения</div>'">
                    <div class="attachment-info">Изображение ${i + 1}${attachment.fileName ? ` (${attachment.fileName})` : ''}</div>
                </div>
            `;
        } else if (attachment.type.startsWith('video/')) {
            html += `
                <div class="attachment-item">
                    <video controls src="${mediaSrc}" style="max-width: 300px; max-height: 300px;"
                           onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'text-align:center;color:var(--error);padding:20px;\\'>❌ Ошибка загрузки видео</div>'">
                    </video>
                    <div class="attachment-info">Видео ${i + 1}${attachment.fileName ? ` (${attachment.fileName})` : ''}</div>
                </div>
            `;
        } else if (attachment.type.startsWith('audio/')) {
            const duration = attachment.duration ? 
                ` (${Math.floor(attachment.duration / 60)}:${(attachment.duration % 60).toString().padStart(2, '0')})` : '';
            
            html += `
                <div class="attachment-item">
                    <div class="audio-player">
                        <audio controls src="${mediaSrc}"
                               onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'text-align:center;color:var(--error);padding:20px;\\'>❌ Ошибка загрузки аудио</div>'">
                        </audio>
                        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">
                            Голосовое сообщение${duration}${attachment.fileName ? ` (${attachment.fileName})` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    container.innerHTML = html || '<div class="no-attachments">Нет доступных вложений</div>';
}

// Открытие модального окна добавления задания
function openAddTaskModal() {
    const titleInput = getElement('newTaskTitle');
    const descInput = getElement('newTaskDescription');
    const dateInput = getElement('newTaskDate');
    const pointsInput = getElement('newTaskPoints');
    const modal = getElement('addTaskModal');
    
    if (!titleInput || !modal) return;
    
    titleInput.value = '';
    descInput.value = '';
    
    // Установка текущей даты по умолчанию - ИСПРАВЛЕННАЯ ВЕРСИЯ
    const today = new Date();
    // Преобразуем дату в формат YYYY-MM-DD с учетом локального времени
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    
    dateInput.value = todayString;
    pointsInput.value = 10;
    modal.style.display = 'block';
}

// Функция для правильного форматирования даты в формате YYYY-MM-DD
function formatDateForInput(date) {
    const d = new Date(date);
    // Используем локальные компоненты даты
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Функция для получения сегодняшней даты в правильном формате
function getTodayDate() {
    return formatDateForInput(new Date());
}

function closeAddTaskModal() {
    const modal = getElement('addTaskModal');
    if (modal) modal.style.display = 'none';
}

// Добавление нового задания
function addTask() {
    const titleInput = getElement('newTaskTitle');
    const descInput = getElement('newTaskDescription');
    const dateInput = getElement('newTaskDate');
    const pointsInput = getElement('newTaskPoints');
    
    if (!titleInput || !descInput || !dateInput) return;
    
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const date = dateInput.value;
    const points = parseInt(pointsInput.value);
    
    if (!title || !description || !date) {
        alert('Заполните все поля!');
        return;
    }
    
    // Проверка даты (нельзя создать задание на прошедшую дату, кроме сегодняшней)
    const taskDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Сбрасываем время для сравнения только дат
    
    // Сбрасываем время у taskDate для корректного сравнения
    const taskDateOnly = new Date(taskDate);
    taskDateOnly.setHours(0, 0, 0, 0);
    
    if (taskDateOnly < today) {
        alert('Нельзя создать задание на прошедшую дату!');
        return;
    }
    
    const newTask = {
        id: Date.now(),
        title,
        description,
        date,
        points: points || 10,
        status: 'current',
        viewed: false,
        answer: '',
        attachments: [],
        submittedDate: null,
        completedDate: null
    };
    
    appData.tasks.push(newTask);
    saveData();
    renderParentTasks();
    closeAddTaskModal();
}

// Открытие задания на проверке
let currentReviewTaskId = null;
async function openReviewTask(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'review') return;
    
    currentReviewTaskId = taskId;
    
    const titleEl = getElement('reviewTaskTitle');
    const descEl = getElement('reviewTaskDescription');
    const answerEl = getElement('reviewAnswerText');
    const attachmentEl = getElement('reviewAttachment');
    const commentSection = getElement('reviewCommentSection');
    const commentInput = getElement('reviewComment');
    const modal = getElement('reviewTaskModal');
    
    if (titleEl) titleEl.textContent = task.title;
    if (descEl) descEl.textContent = task.description;
    if (answerEl) answerEl.textContent = task.answer || 'Ответ не предоставлен';
    
    if (attachmentEl) {
        // Показываем индикатор загрузки
        attachmentEl.innerHTML = '<div class="attachment-loading">Загрузка вложений...</div>';
        
        // Загружаем вложения с проверкой доступности
        await displayAttachmentsWithCheck(task.attachments, attachmentEl);
    }
    
    if (commentSection) commentSection.style.display = 'none';
    if (commentInput) commentInput.value = '';
    
    if (modal) modal.style.display = 'block';
}

// Открытие изображения на полный экран
function openFullscreenImage(src) {
    const fullscreenModal = document.createElement('div');
    fullscreenModal.className = 'fullscreen-modal';
    fullscreenModal.innerHTML = `
        <div class="fullscreen-content">
            <span class="fullscreen-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <img src="${src}" alt="Полноэкранное изображение" class="fullscreen-image">
        </div>
    `;
    
    // Добавляем стили если их еще нет
    if (!document.querySelector('#fullscreenStyles')) {
        const styles = document.createElement('style');
        styles.id = 'fullscreenStyles';
        styles.textContent = `
            .fullscreen-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 4000;
                animation: fadeIn 0.3s ease;
            }
            .fullscreen-content {
                position: relative;
                max-width: 90%;
                max-height: 90%;
            }
            .fullscreen-close {
                position: absolute;
                top: -40px;
                right: 0;
                color: white;
                font-size: 40px;
                cursor: pointer;
                background: rgba(0,0,0,0.5);
                border-radius: 50%;
                width: 50px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
            }
            .fullscreen-close:hover {
                background: rgba(255,255,255,0.2);
                transform: scale(1.1);
            }
            .fullscreen-image {
                max-width: 100%;
                max-height: 90vh;
                border-radius: 10px;
                box-shadow: 0 0 30px rgba(255,255,255,0.2);
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(fullscreenModal);
    
    // Закрытие по клику вне изображения
    fullscreenModal.addEventListener('click', function(e) {
        if (e.target === fullscreenModal) {
            fullscreenModal.remove();
        }
    });
    
    // Закрытие по ESC
    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            fullscreenModal.remove();
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}

function closeReviewModal() {
    const modal = getElement('reviewTaskModal');
    const commentSection = getElement('reviewCommentSection');
    const commentInput = getElement('reviewComment');
    
    if (modal) modal.style.display = 'none';
    if (commentSection) commentSection.style.display = 'none';
    if (commentInput) commentInput.value = '';
    currentReviewTaskId = null;
}

// Принятие задания
function approveTask() {
    const task = appData.tasks.find(t => t.id === currentReviewTaskId);
    if (!task) return;
    
    task.status = 'completed';
    task.completedDate = new Date().toISOString();
    task.needsRevision = false;
    task.parentComment = null;
    appData.child.points += task.points;
    
    const newLevel = Math.floor(appData.child.points / 100) + 1;
    if (newLevel > appData.child.level) {
        const levelsGained = newLevel - appData.child.level; // ← РАССЧИТЫВАЕМ СКОЛЬКО УРОВНЕЙ ПОЛУЧЕНО
        appData.child.level = newLevel;
        appData.child.levelUpNotification = true;
        
        // НАЧИСЛЯЕМ ДЕНЬГИ ЗА КАЖДЫЙ ПОЛУЧЕННЫЙ УРОВЕНЬ
        const moneyPerLevel = 100;
        const totalMoneyGained = levelsGained * moneyPerLevel; // ← УМНОЖАЕМ НА КОЛИЧЕСТВО УРОВНЕЙ
        appData.child.piggyBankAmount = (appData.child.piggyBankAmount || 0) + totalMoneyGained;
        appData.child.moneyUpNotification = true;
        
        // ОБНОВЛЯЕМ УВЕДОМЛЕНИЕ ЧТОБЫ ПОКАЗЫВАЛО ПРАВИЛЬНУЮ СУММУ
        sessionStorage.setItem('moneyNotificationAmount', totalMoneyGained.toString());
    }
    
    saveData();
    renderParentTasks();
    updateParentStats();
    updateParentPiggyInfo();
    closeReviewModal();
    updateParentHeader();
}

// Обновление информации о копилке для родителя
function updateParentPiggyInfo() {
    const amountEl = getElement('parentPiggyAmount');
    const progressEl = getElement('parentPiggyProgress');
    const progressTextEl = getElement('parentPiggyProgressText');
    
    const currentAmount = appData.child.piggyBankAmount || 0;
    
    if (amountEl) amountEl.textContent = currentAmount + '₽';
    
    // Реалистичный прогресс: показываем фактическое заполнение до 1000₽
    const progress = Math.min((currentAmount / 1000) * 100, 100);
    
    if (progressEl) {
        progressEl.style.width = progress + '%';
    }
    
    if (progressTextEl) {
        progressTextEl.textContent = `${currentAmount}/1000₽`;
    }
}

// Показать поле для комментария при возврате
function showRejectComment() {
    const commentSection = getElement('reviewCommentSection');
    const commentInput = getElement('reviewComment');
    
    if (!commentSection || !commentInput) return;
    
    if (commentSection.style.display === 'none') {
        commentSection.style.display = 'block';
        commentInput.focus();
    } else {
        rejectTask();
    }
}

// Отклонение задания
function rejectTask() {
    const task = appData.tasks.find(t => t.id === currentReviewTaskId);
    if (!task) return;
    
    const commentInput = getElement('reviewComment');
    const comment = commentInput ? commentInput.value.trim() : '';
    
    task.status = 'current';
    task.answer = '';
    task.attachments = [];
    task.submittedDate = null;
    task.parentComment = comment || null;
    task.needsRevision = true;
    
    saveData();
    renderParentTasks();
    closeReviewModal();
    updateParentHeader();
    
    const commentSection = getElement('reviewCommentSection');
    if (commentSection) commentSection.style.display = 'none';
    if (commentInput) commentInput.value = '';
}

// Обновление статистики родителя
function updateParentStats() {
    const completed = appData.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = appData.tasks.length;
    const totalPoints = appData.child.points;
    const level = appData.child.level;
    
    const completedEl = getElement('parentTotalCompleted');
    const pointsEl = getElement('parentTotalPoints');
    const levelEl = getElement('parentCurrentLevel');
    
    if (completedEl) completedEl.textContent = completed;
    if (pointsEl) pointsEl.textContent = totalPoints;
    if (levelEl) levelEl.textContent = level;
    
}

// Редактирование задания
let currentEditTaskId = null;

function openEditTaskModal(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    currentEditTaskId = taskId;
    
    const titleInput = getElement('editTaskTitle');
    const descInput = getElement('editTaskDescription');
    const dateInput = getElement('editTaskDate');
    const pointsInput = getElement('editTaskPoints');
    const modal = getElement('editTaskModal');
    
    if (!titleInput || !modal) return;
    
    titleInput.value = task.title;
    descInput.value = task.description;
    
    // Используем нашу функцию форматирования даты
    dateInput.value = formatDateForInput(task.date);
    
    pointsInput.value = task.points;
    modal.style.display = 'block';
}

function closeEditTaskModal() {
    const modal = getElement('editTaskModal');
    if (modal) modal.style.display = 'none';
    currentEditTaskId = null;
}

function saveEditedTask() {
    if (!currentEditTaskId) return;
    
    const task = appData.tasks.find(t => t.id === currentEditTaskId);
    if (!task) return;
    
    const titleInput = getElement('editTaskTitle');
    const descInput = getElement('editTaskDescription');
    const dateInput = getElement('editTaskDate');
    const pointsInput = getElement('editTaskPoints');
    
    if (!titleInput || !descInput || !dateInput) return;
    
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const date = dateInput.value;
    const points = parseInt(pointsInput.value);
    
    if (!title || !description || !date) {
        alert('Заполните все поля!');
        return;
    }
    
    task.title = title;
    task.description = description;
    task.date = date;
    task.points = points || 10;
    
    saveData();
    renderParentTasks();
    closeEditTaskModal();
}

function deleteTask() {
    if (!currentEditTaskId) return;
    
    if (!confirm('Вы уверены, что хотите удалить это задание?')) {
        return;
    }
    
    const taskIndex = appData.tasks.findIndex(t => t.id === currentEditTaskId);
    if (taskIndex !== -1) {
        appData.tasks.splice(taskIndex, 1);
        saveData();
        renderParentTasks();
        updateParentStats();
        closeEditTaskModal();
    }
}

// Функции сброса статистики ребенка
function resetChildPoints() {
    if (!confirm('Сбросить все очки ребенка? Это действие нельзя отменить.')) {
        return;
    }
    
    appData.child.points = 0;
    saveData();
    updateParentStats();
    alert('Очки ребенка сброшены!');
}

function resetChildLevel() {
    if (!confirm('Сбросить уровень ребенка на 1? Это действие нельзя отменить.')) {
        return;
    }
    
    appData.child.level = 1;
    saveData();
    updateParentStats();
    alert('Уровень ребенка сброшен!');
}

function resetChildStats() {
    if (!confirm('Полностью сбросить всю статистику ребенка (уровень, очки, задания)? Это действие нельзя отменить.')) {
        return;
    }
    
  // 2. Сбрасываем статистику ребенка
        appData.child.level = 1;
        appData.child.points = 0;
        appData.child.piggyBankAmount = 0;
        appData.child.levelUpNotification = false;
        appData.child.moneyUpNotification = false;
        
        // 3. Очищаем все задания
        appData.tasks = [];
        
        // 4. Очищаем запросы на вывод
        appData.withdrawalRequests = [];
    saveData();
    updateParentStats();
    alert('Статистика ребенка полностью сброшена!');
}

function closeParentSettingsModal() {
    const modal = getElement('parentSettingsModal');
    if (modal) modal.style.display = 'none';
}

// Обновленная функция сохранения настроек родителя
async function saveParentSettings() {
    const passwordInput = getElement('newPassword');
    if (!passwordInput) return;
    
    const newPassword = passwordInput.value.trim();
    
    if (newPassword && newPassword.length >= 4) {
        // Хэшируем новый пароль
        const newHash = await hashPassword(newPassword);
        appData.parentPasswordHash = newHash;
        
        // Удаляем старый пароль если он есть
        if (appData.parentPassword) {
            delete appData.parentPassword;
        }
        
        await saveData();
        alert('Пароль успешно изменен!');
        closeParentSettingsModal();
        
        // Очищаем поле
        passwordInput.value = '';
    } else {
        alert('Пароль должен содержать минимум 4 символа!');
    }
}

// Закрытие модальных окон при клике вне их
window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let modal of modals) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
}

// Обработка Enter в полях ввода пароля
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const passwordInput = getElement('parentPassword');
        if (passwordInput && document.activeElement === passwordInput) {
            loginParent();
        }
    }
});

// Полный выход из приложения с подтверждением
function exitApp() {
    if (confirm('Завершить работу с приложением?')) {
        // Создаем полноэкранное сообщение о выходе
        const exitOverlay = document.createElement('div');
        exitOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: var(--bg-primary);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: inherit;
        `;
        
        exitOverlay.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 80px; margin-bottom: 20px;">👋</div>
                <h2 style="color: var(--text-dark); margin-bottom: 10px;">Приложение закрыто</h2>
                <p style="color: var(--text-light);">Закройте эту вкладку браузера</p>
                <button onclick="window.close()" style="
                    background: var(--bg-terracotta);
                    color: white;
                    border: 2px solid var(--wood-border);
                    padding: 12px 24px;
                    border-radius: 15px;
                    margin-top: 20px;
                    cursor: pointer;
                    font-size: 16px;
                ">Закрыть вкладку</button>
            </div>
        `;
        
        document.body.appendChild(exitOverlay);
        
        // Блокируем любые действия на странице
        document.addEventListener('keydown', blockKeys);
        document.addEventListener('click', blockClicks);
        
        function blockKeys(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        function blockClicks(e) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
}

// ======================
// ОСНОВНЫЕ ФУНКЦИИ БЭКАПОВ
// ======================

async function createBackup() {
    console.log('🔄 Создание бэкапа...');
    
    // Показываем анимацию загрузки
    let originalText = ''; // ← ВЫНЕСИТЕ ОБЪЯВЛЕНИЕ ЗА ПРЕДЕЛЫ try
    const createBtn = event?.target;
    
    if (createBtn) {
        originalText = createBtn.innerHTML;
        createBtn.innerHTML = '⏳ Создание...';
        createBtn.classList.add('backup-creating');
        createBtn.disabled = true;
    }
    
    try {
        // Собираем все данные для бэкапа
        const backupData = {
            appData: {
                child: {
                    name: appData.child.name,
                    level: appData.child.level,
                    points: appData.child.points,
                    piggyBankAmount: appData.child.piggyBankAmount || 0,
                    avatar: appData.child.avatar,
                    lastSeen: appData.child.lastSeen
                },
                tasks: appData.tasks,
                withdrawalRequests: appData.withdrawalRequests || [],
                parentPassword: appData.parentPassword
            },
            timestamp: new Date().toISOString(),
            type: 'manual',
            version: '1.0',
            device: getDeviceId(),
            stats: {
                level: appData.child.level,
                points: appData.child.points,
                tasks: appData.tasks.length,
                piggyAmount: appData.child.piggyBankAmount || 0,
                completedTasks: appData.tasks.filter(t => t.status === 'completed').length,
                pendingWithdrawals: (appData.withdrawalRequests || []).filter(r => r.status === 'pending').length
            }
        };
        
        // Сохраняем в localStorage
        const backupKey = `backup_manual_${Date.now()}`;
        localStorage.setItem(backupKey, JSON.stringify(backupData));
        
        // Скачиваем как файл
        downloadBackupFile(backupData);
        
        // Обновляем информацию о бэкапах
        updateBackupInfo();
        
        // Показываем уведомление
        showBackupNotification('success', `Бэкап создан! Уровень: ${appData.child.level}, Очки: ${appData.child.points}`);
        
        console.log('✅ Бэкап создан:', backupKey);
        
    } catch (error) {
        console.error('❌ Ошибка создания бэкапа:', error);
        showBackupNotification('error', 'Ошибка создания бэкапа');
    } finally {
        // Восстанавливаем кнопку
        if (createBtn && originalText) { // ← ДОБАВЬТЕ ПРОВЕРКУ НА originalText
            setTimeout(() => {
                createBtn.innerHTML = originalText;
                createBtn.classList.remove('backup-creating');
                createBtn.disabled = false;
            }, 1000);
        }
    }
}

// Скачивание бэкапа как файл
function downloadBackupFile(backupData) {
    try {
        const formattedDate = new Date(backupData.timestamp)
            .toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
        
        const filename = `бэкап_${appData.child.name}_${formattedDate}.json`;
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        console.log('📄 Бэкап скачан:', filename);
        
    } catch (error) {
        console.error('❌ Ошибка скачивания бэкапа:', error);
    }
}

// Показать менеджер бэкапов
function showBackupManager() {
    console.log('📂 Открытие менеджера бэкапов...');
    
    const modal = document.getElementById('backupManagerModal');
    if (!modal) return;
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Загружаем и отображаем бэкапы
    displayBackupsList();
}

// Закрыть менеджер бэкапов
function closeBackupManager() {
    const modal = document.getElementById('backupManagerModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Отображение списка бэкапов
function displayBackupsList(page = 1, itemsPerPage = 5) {
    const listEl = document.getElementById('backupsList');
    const paginationEl = document.getElementById('backupPagination');
    
    if (!listEl) return;
    
    // Получаем все бэкапы
    const backups = getAllBackups();
    
    if (backups.length === 0) {
        listEl.innerHTML = `
            <div class="backup-loading" style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 20px;">📂</div>
                <div style="color: var(--text-light); font-size: 16px;">
                    Нет доступных бэкапов<br>
                    <small>Создайте первый бэкап кнопкой выше</small>
                </div>
            </div>
        `;
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }
    
    // Сортируем по дате (новые сначала)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Пагинация
    const totalPages = Math.ceil(backups.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageBackups = backups.slice(startIndex, endIndex);
    
    // Отображаем бэкапы
    listEl.innerHTML = pageBackups.map(backup => createBackupItemHTML(backup)).join('');
    
    // Отображаем пагинацию
    if (paginationEl) {
        let paginationHTML = '';
        
        // Предыдущая страница
        if (page > 1) {
            paginationHTML += `<button class="pagination-btn" onclick="displayBackupsList(${page - 1})">←</button>`;
        }
        
        // Номера страниц
        for (let i = 1; i <= totalPages; i++) {
            if (i === page) {
                paginationHTML += `<button class="pagination-btn active">${i}</button>`;
            } else {
                paginationHTML += `<button class="pagination-btn" onclick="displayBackupsList(${i})">${i}</button>`;
            }
        }
        
        // Следующая страница
        if (page < totalPages) {
            paginationHTML += `<button class="pagination-btn" onclick="displayBackupsList(${page + 1})">→</button>`;
        }
        
        paginationEl.innerHTML = paginationHTML;
    }
}

// Получение всех бэкапов
function getAllBackups() {
    const backups = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('backup_') || key.startsWith('auto_backup_')) {
            try {
                const backupStr = localStorage.getItem(key);
                const backupData = JSON.parse(backupStr);
                
                backups.push({
                    key: key,
                    ...backupData
                });
                
            } catch (error) {
                console.error('❌ Ошибка парсинга бэкапа:', key, error);
            }
        }
    }
    
    return backups;
}

// Создание HTML для элемента бэкапа
function createBackupItemHTML(backup) {
    const date = new Date(backup.timestamp);
    const dateStr = date.toLocaleDateString('ru-RU');
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    const isManual = backup.type === 'manual';
    const typeText = isManual ? 'Ручной' : 'Авто';
    const typeClass = isManual ? 'backup-type-manual' : 'backup-type-auto';
    
    // Безопасное получение данных
    const stats = backup.stats || {};
    const appData = backup.appData || {};
    const childData = appData.child || {};
    
    const level = childData.level || stats.level || 1;
    const points = childData.points || stats.points || 0;
    const piggyAmount = childData.piggyBankAmount || stats.piggyAmount || 0;
    const tasksCount = stats.tasks || 0;
    const completedTasks = stats.completedTasks || 0;
    
    return `
        <div class="backup-item" style="position: relative;">
            <div class="backup-type-indicator ${typeClass}" title="${typeText} бэкап">
                ${isManual ? '👋' : '🤖'}
            </div>
            
            <div class="backup-item-header">
                <div>
                    <div class="backup-item-title">Уровень ${level}</div>
                    <div class="backup-item-date">${dateStr} ${timeStr}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 14px; color: var(--text-dark);">
                        ⭐ ${points} очков
                    </div>
                    <div style="font-size: 12px; color: var(--text-light);">
                        ${backup.device ? `Устройство: ${backup.device.substring(0, 8)}` : ''}
                    </div>
                </div>
            </div>
            
            <div class="backup-item-stats">
                <span class="stat-badge">💰 ${piggyAmount}₽</span>
                <span class="stat-badge">📝 ${tasksCount} заданий</span>
                <span class="stat-badge">✅ ${completedTasks} выполнено</span>
            </div>
            
            <div class="backup-item-actions">
                <button onclick="restoreBackup('${backup.key}')" class="btn-backup-action btn-backup-restore">
                    ♻️ Восстановить
                </button>
                <button onclick="downloadBackup('${backup.key}')" class="btn-backup-action btn-backup-download">
                    📥 Скачать
                </button>
                <button onclick="deleteBackup('${backup.key}')" class="btn-backup-action btn-backup-delete">
                    🗑️ Удалить
                </button>
            </div>
        </div>
    `;
}

// Восстановление из бэкапа
async function restoreBackup(backupKey) {
    try {
        const backupStr = localStorage.getItem(backupKey);
        if (!backupStr) {
            alert('❌ Бэкап не найден');
            return;
        }
        
        const backupData = JSON.parse(backupStr);
        
        if (!confirm(`Восстановить данные из бэкапа от ${new Date(backupData.timestamp).toLocaleString()}?\n\nЭто перезапишет ВСЕ текущие данные!`)) {
            return;
        }
        
        // Создаем бэкап текущих данных перед восстановлением
        const currentBackup = {
            appData: appData,
            timestamp: new Date().toISOString(),
            type: 'auto',
            note: 'Создан перед восстановлением'
        };
        localStorage.setItem(`backup_pre_restore_${Date.now()}`, JSON.stringify(currentBackup));
        
        // Восстанавливаем данные
        appData = backupData.appData;
        
        // Сохраняем
        await saveData();
        
        // Обновляем UI
        updateBackupInfo();
        if (window.location.pathname.includes('child.html')) {
            initChildPage();
        } else if (window.location.pathname.includes('parent.html')) {
            initParentPage();
        }
        
        // Показываем уведомление
        showBackupNotification('success', `Данные восстановлены! Уровень: ${appData.child.level}`);
        
        // Закрываем менеджер бэкапов
        closeBackupManager();
        
    } catch (error) {
        console.error('❌ Ошибка восстановления:', error);
        showBackupNotification('error', 'Ошибка восстановления данных');
    }
}

// Скачивание конкретного бэкапа
function downloadBackup(backupKey) {
    try {
        const backupStr = localStorage.getItem(backupKey);
        if (!backupStr) return;
        
        const backupData = JSON.parse(backupStr);
        downloadBackupFile(backupData);
        
        showBackupNotification('success', 'Бэкап скачан');
        
    } catch (error) {
        console.error('❌ Ошибка скачивания:', error);
        showBackupNotification('error', 'Ошибка скачивания');
    }
}

// Удаление бэкапа
function deleteBackup(backupKey) {
    if (!confirm('Удалить этот бэкап?\nЭто действие нельзя отменить.')) {
        return;
    }
    
    try {
        localStorage.removeItem(backupKey);
        displayBackupsList();
        updateBackupInfo();
        
        showBackupNotification('success', 'Бэкап удален');
        
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        showBackupNotification('error', 'Ошибка удаления');
    }
}

// ЗАМЕНЯЕМ функцию importbackups:
function importBackups() {
    // Создаем скрытый input для выбора файла
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    
    fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            // Показываем индикатор загрузки
            showBackupNotification('info', 'Загрузка файла...');
            
            // Читаем файл
            const text = await file.text();
            const backupData = JSON.parse(text);
            
            // Проверяем формат
            if (!backupData.appData) {
                throw new Error('Неверный формат файла бэкапа');
            }
            
            if (!confirm(`Восстановить данные из бэкапа?\nДата: ${new Date(backupData.timestamp).toLocaleString()}\n\nЭто перезапишет текущие данные.`)) {
                return;
            }
            
            // Создаем резервную копию текущих данных
            const currentBackup = {
                appData: appData,
                timestamp: new Date().toISOString(),
                type: 'auto',
                note: 'Авто-бэкап перед импортом'
            };
            localStorage.setItem(`backup_auto_preimport_${Date.now()}`, JSON.stringify(currentBackup));
            
            // Восстанавливаем данные
            appData = backupData.appData;
            
            // Сохраняем
            await saveData();
            
            // Обновляем UI
            updateBackupInfo();
            if (window.location.pathname.includes('parent.html')) {
                initParentPage();
            }
            
            showBackupNotification('success', `Данные восстановлены!`);
            closeBackupManager();
            
        } catch (error) {
            console.error('❌ Ошибка импорта:', error);
            showBackupNotification('error', 'Ошибка загрузки файла');
        }
    };
    
    // Добавляем input на страницу и кликаем по нему
    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => {
        if (fileInput.parentNode) {
            document.body.removeChild(fileInput);
        }
    }, 1000);
}

// Очистка старых бэкапов
function cleanupOldBackups() {
    const keepCount = prompt('Сколько последних бэкапов оставить?', '10');
    if (!keepCount) return;
    
    const count = parseInt(keepCount);
    if (isNaN(count) || count < 1) {
        alert('Введите корректное число');
        return;
    }
    
    const backups = getAllBackups();
    
    // Сортируем по дате (новые сначала)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Удаляем старые
    const toDelete = backups.slice(count);
    
    if (toDelete.length === 0) {
        alert('Нет старых бэкапов для удаления');
        return;
    }
    
    if (!confirm(`Удалить ${toDelete.length} старых бэкапов?\nОстанется ${count} последних бэкапов.`)) {
        return;
    }
    
    toDelete.forEach(backup => {
        localStorage.removeItem(backup.key);
    });
    
    displayBackupsList();
    updateBackupInfo();
    
    showBackupNotification('success', `Удалено ${toDelete.length} старых бэкапов`);
}

// Показать уведомление о бэкапе
function showBackupNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `backup-notification ${type}`;
    
    // Выбираем иконку по типу
    let icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'info') icon = 'ℹ️';
    if (type === 'warning') icon = '⚠️';
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">${icon}</span>
            <span>${message}</span>
        </div>
    `;
    
    // Стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : 
                     type === 'error' ? '#F44336' : 
                     type === 'info' ? '#2196F3' : '#FF9800'};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-family: inherit;
        max-width: 300px;
        word-break: break-word;
    `;
    
    // Добавляем на страницу
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
    
    // Добавляем стили анимации если их нет
    if (!document.querySelector('#backupNotificationStyles')) {
        const style = document.createElement('style');
        style.id = 'backupNotificationStyles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            /* Для мобильных */
            @media (max-width: 768px) {
                .backup-notification {
                    top: 10px !important;
                    right: 10px !important;
                    left: 10px !important;
                    max-width: calc(100% - 20px) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Автоматическое обновление информации при открытии настроек
function openParentSettings() {
    const passwordInput = getElement('newPassword');
    const modal = getElement('parentSettingsModal');
    
    if (passwordInput) passwordInput.value = '';
    if (modal) {
        modal.style.display = 'block';
        
        // Обновляем информацию о бэкапах
        updateBackupInfo();
        
        // Обновляем отображение текущей статистики
        const statsInfo = modal.querySelector('.reset-section div:last-child');
        if (statsInfo) {
            statsInfo.textContent = `Текущие: Уровень ${appData.child.level}, ${appData.child.points} очков`;
        }
    }
}

function updateBackupInfo() {
    const backups = getAllBackups();
    
    // Сортируем по дате (новые сначала)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Обновляем информацию в UI
    const lastBackupTime = document.getElementById('lastBackupTime');
    const totalBackupsCount = document.getElementById('totalBackupsCount');
    const backupSize = document.getElementById('backupSize');
    
    // ПРОВЕРКА НАЛИЧИЯ ЭЛЕМЕНТОВ ← ДОБАВЬТЕ ЭТО
    if (!lastBackupTime || !totalBackupsCount || !backupSize) {
        // Если элементы не найдены, просто выходим
        // Это нормально, когда функция вызывается в разных контекстах
        return;
    }
    
    if (backups.length > 0) {
        const latest = backups[0];
        const date = new Date(latest.timestamp);
        
        lastBackupTime.textContent = date.toLocaleString('ru-RU');
    } else {
        lastBackupTime.textContent = 'Не создавался';
    }
    
    totalBackupsCount.textContent = backups.length;
    
    // Рассчитываем общий размер
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('backup_') || key.startsWith('auto_backup_')) {
            const item = localStorage.getItem(key);
            totalSize += item ? item.length : 0;
        }
    }
    const sizeKB = (totalSize / 1024).toFixed(1);
    backupSize.textContent = `${sizeKB} KB`;
}
console.log('Script.js загружен успешно');