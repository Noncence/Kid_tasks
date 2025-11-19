// ==================== FIREBASE CONFIGURATION ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase автоматически находит конфигурацию при деплое на Firebase Hosting
const app = initializeApp({
    // Конфигурация будет автоматически подгружена Firebase Hosting
});

const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;

// Остальные Firebase функции остаются без изменений...
async function initFirebase() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Инициализация Firebase...');
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                console.log('✅ Пользователь аутентифицирован:', user.uid);
                resolve(true);
            } else {
                try {
                    const userCredential = await signInAnonymously(auth);
                    currentUser = userCredential.user;
                    console.log('✅ Анонимный пользователь создан:', currentUser.uid);
                    resolve(true);
                } catch (error) {
                    console.error('❌ Ошибка аутентификации:', error);
                    reject(error);
                }
            }
        });
    });
}

// Локальное хранилище данных
let appData = {
    parentPassword: '1234',
    child: {
        name: 'Ребенок',
        avatar: 'https://via.placeholder.com/150/6C5CE7/FFFFFF?text=👶',
        level: 1,
        points: 0,
        isOnline: true,
        levelUpNotification: false // Флаг для уведомления о повышении уровня
    },
    tasks: []
};

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

// Простое шифрование пароля
function encryptPassword(password) {
    return btoa(password + 'family_dashboard_salt');
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
        // Инициализируем Firebase с автоматической анонимной авторизацией
        await initFirebase();
        
        // Загружаем данные
        await loadData();
        
        // Инициализируем страницу
        initCurrentPage();
        
        console.log('Приложение инициализировано');
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        // Fallback: загружаем только из localStorage
        await loadData();
        initCurrentPage();
    }
    
    // Симуляция онлайн статуса
    setInterval(updateChildOnlineStatus, 30000);
    
    // Автоматическая синхронизация каждые 30 секунд
    setInterval(async () => {
        if (currentUser) {
            console.log('Автоматическая синхронизация...');
            await loadData();
            
            // Обновляем интерфейс
            if (window.location.pathname.includes('child.html')) {
                renderChildTasks();
                updateChildStats();
                updateChildHeader();
            } else if (window.location.pathname.includes('parent.html')) {
                renderParentTasks();
                updateParentStats();
                updateParentHeader();
            }
        }
    }, 30000);
});

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

// Обновленная функция загрузки данных
async function loadData() {
    try {
        // Всегда сначала пробуем загрузить из Firebase
        if (currentUser) {
            console.log('Загружаем данные из Firebase...');
            const firebaseData = await loadUserData(currentUser.uid);
            if (firebaseData) {
                appData = { ...appData, ...firebaseData };
                
                // Всегда сохраняем в localStorage как резервную копию
                localStorage.setItem('appData', JSON.stringify(appData));
                return;
            }
        }
        
        // Если в Firebase нет данных, пробуем загрузить из localStorage
        console.log('Загружаем данные из localStorage...');
        const saved = localStorage.getItem('appData');
        if (saved) {
            try {
                const parsedData = JSON.parse(saved);
                appData = { ...appData, ...parsedData };
                console.log('Данные загружены из localStorage');
                
                // Сохраняем в Firebase для синхронизации
                if (currentUser) {
                    await saveUserData(currentUser.uid, appData);
                }
            } catch (e) {
                console.error('Ошибка загрузки данных:', e);
            }
        } else {
            console.log('Нет сохраненных данных, используются данные по умолчанию');
            
            // Сохраняем данные по умолчанию в Firebase
            if (currentUser) {
                await saveUserData(currentUser.uid, appData);
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        // Fallback: загружаем из localStorage
        const saved = localStorage.getItem('appData');
        if (saved) {
            try {
                const parsedData = JSON.parse(saved);
                appData = { ...appData, ...parsedData };
                console.log('Данные загружены из localStorage (fallback)');
            } catch (e) {
                console.error('Ошибка загрузки из localStorage:', e);
            }
        }
    }
}

// Обнови функцию saveData
async function saveData() {
    try {
        // Всегда сохраняем в localStorage
        localStorage.setItem('appData', JSON.stringify(appData));
        console.log('Данные сохранены в localStorage');
        
        // Пробуем сохранить в Firebase
        if (currentUser) {
            console.log('Сохраняем данные в Firebase...');
            await saveUserData(currentUser.uid, appData);
        }
        
        return true;
    } catch (e) {
        console.error('Ошибка сохранения данных:', e);
        return false;
    }
}

// Загрузка данных из localStorage
/* function loadData() {
    const saved = localStorage.getItem('appData');
    if (saved) {
        try {
            const parsedData = JSON.parse(saved);
            appData = { ...appData, ...parsedData };
            console.log('Данные загружены из localStorage');
        } catch (e) {
            console.error('Ошибка загрузки данных:', e);
        }
    } else {
        console.log('Локальные данные не найдены, используются данные по умолчанию');
    }
} */



// Очистка старых выполненных заданий
function clearOldCompletedTasks() {
    const completedTasks = appData.tasks.filter(t => t.status === 'completed');
    
    // Оставляем только последние 20 выполненных заданий
    if (completedTasks.length > 20) {
        const tasksToKeep = completedTasks
            .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate))
            .slice(0, 20);
        
        const otherTasks = appData.tasks.filter(t => t.status !== 'completed');
        appData.tasks = [...otherTasks, ...tasksToKeep];
        console.log(`Очищено ${completedTasks.length - 20} старых выполненных заданий`);
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

// Проверка и очистка данных если нужно
function clearOldDataIfNeeded() {
    // Очищаем вложения у старых выполненных заданий
    const oldCompletedTasks = appData.tasks.filter(t => 
        t.status === 'completed' && 
        t.completedDate && 
        (Date.now() - new Date(t.completedDate).getTime()) > 30 * 24 * 60 * 60 * 1000 // старше 30 дней
    );
    
    oldCompletedTasks.forEach(task => {
        if (task.attachments) {
            console.log(`Очищаем вложения у старого задания: ${task.title}`);
            task.attachments = [];
        }
    });
}

// Показать уведомление об ошибке хранилища
function showStorageError() {
    alert('Недостаточно места для сохранения. Попробуйте удалить некоторые выполненные задания или уменьшить размер прикрепленных файлов.');
}

// Функция для ручной очистки старых данных
function cleanupStorage() {
    const confirmed = confirm('Это очистит вложения у старых выполненных заданий. Продолжить?');
    if (!confirmed) return;
    
    const completedTasks = appData.tasks.filter(t => t.status === 'completed');
    let cleanedCount = 0;
    
    completedTasks.forEach(task => {
        if (task.attachments && task.attachments.length > 0) {
            task.attachments = [];
            cleanedCount++;
        }
    });
    
    if (saveData()) {
        alert(`Очищено вложений у ${cleanedCount} заданий. Данные сохранены.`);
    } else {
        alert('Ошибка при сохранении после очистки.');
    }
}

// Выбор роли на стартовой странице
function Role(role) {
    console.log('Выбрана роль:', role);
    if (role === 'child') {
        window.location.href = 'child.html';
    } else if (role === 'parent') {
        const modal = getElement('parentLoginModal');
        if (modal) modal.style.display = 'block';
    }
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
function loginParent() {
    const passwordInput = getElement('parentPassword');
    const errorEl = getElement('parentError');
    
    if (!passwordInput) return;
    
    const password = passwordInput.value;
    
    if (encryptPassword(password) === encryptPassword(appData.parentPassword)) {
        // Сохраняем аутентификацию родителя
        sessionStorage.setItem('parentAuthenticated', 'true');
        window.location.href = 'parent.html';
    } else {
        if (errorEl) errorEl.textContent = 'Неверный пароль!';
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
    
    // Проверка повышения уровня при заходе на страницу
    checkLevelUpNotification();
    
    updateChildHeader();
    renderChildTasks();
    updateChildStats();
    
    // Инициализация записи голоса
    initVoiceRecording();
    
    // Периодическое обновление
    setInterval(function() {
        loadData();
        renderChildTasks();
        updateChildHeader();
        updateChildStats();
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
    if (!document.queryor('#levelUpStyles')) {
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
    const modal = document.queryor('.level-up-modal');
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
        if (appData.child.avatar) {
            avatar.src = appData.child.avatar;
            if (!appData.child.avatar.startsWith('data:')) {
                avatar.onerror = function() {
                    this.style.display = 'none';
                    fallback.style.display = 'flex';
                };
                avatar.onload = function() {
                    this.style.display = 'block';
                    fallback.style.display = 'none';
                };
            } else {
                avatar.onerror = null;
                avatar.style.display = 'block';
                fallback.style.display = 'none';
            }
        } else {
            avatar.src = '';
            avatar.style.display = 'none';
            fallback.style.display = 'flex';
        }
    }
    
    // Подсчет новых заданий
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
    const now = new Date();
    const currentTasks = appData.tasks.filter(t => t.status === 'current')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const reviewTasks = appData.tasks.filter(t => t.status === 'review');
    const completedTasks = appData.tasks.filter(t => t.status === 'completed')
        .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
    
    const currentTasksEl = getElement('currentTasks');
    const reviewTasksEl = getElement('reviewTasks');
    const completedTasksEl = getElement('completedTasks');
    
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
        // ОГРАНИЧИВАЕМ количество отображаемых заданий
        const completedToShow = completedTasks.slice(0, visibleTasks);
        completedTasksEl.innerHTML = completedToShow.map(task => 
            createTaskCard(task, now, 'completed')
        ).join('');
        
        // ПОКАЗЫВАЕМ/СКРЫВАЕМ КНОПКУ
        const loadMoreBtn = getElement('loadMoreBtn');
        if (loadMoreBtn) {
            if (completedTasks.length > visibleTasks) {
                loadMoreBtn.style.display = 'block';
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }
    }
    
    attachTaskCardListeners();
}

// Прикрепление обработчиков событий к карточкам заданий
function attachTaskCardListeners() {
    document.queryorAll('.task-card[data-task-id]').forEach(card => {
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
    
    // Экранирование всех пользовательских данных
    const safeTitle = escapeHtml(task.title);
    const safeDescription = escapeHtml(task.description);
    const safeComment = task.parentComment ? escapeHtml(task.parentComment) : '';
    
    // Кнопка удаления для выполненных заданий (только на странице родителя)
    const deleteButton = statusClass === 'completed' && window.location.pathname.includes('parent.html') ? 
        `<button class="btn-delete-task" onclick="event.stopPropagation(); deleteCompletedTask(${task.id})" title="Удалить">🗑️</button>` : '';
    
    return `
        <div class="${classes}" data-task-id="${task.id}" data-is-future="${isFuture}">
            ${isNew ? '<span class="new-badge">NEW</span>' : ''}
            ${needsRevision ? '<span class="revision-badge">Доработать</span>' : ''}
            ${deleteButton}
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

// Удаление выполненного задания
function deleteCompletedTask(taskId) {
    if (!confirm('Удалить это выполненное задание?')) {
        return;
    }
    
    const taskIndex = appData.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
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
        if (totalSize > 25 * 1024 * 1024) { // 5 файлов × 5 МБ = 25 МБ
            alert('Общий размер файлов слишком большой! Максимальный размер: 25 МБ');
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
            if (file.size > 5 * 1024 * 1024) { // 5 МБ на файл
                alert(`Файл "${file.name}" слишком большой! Максимальный размер: 5 МБ`);
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
    const attachmentItems = preview.queryorAll('.attachment-item');
    
    attachmentItems.forEach(item => {
        const img = item.queryor('img');
        const video = item.queryor('video');
        
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
function displayAudioPreview(audioUrl, audioBlob) {
    const voicePreview = getElement('voicePreview');
    if (!voicePreview) return;
    
    // Сохраняем blob для последующего использования
    const audioAttachment = {
        data: audioUrl,
        blob: audioBlob,
        type: 'audio/wav',
        duration: recordingSeconds
    };
    
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
    
    // Сохраняем во временное хранилище
    sessionStorage.setItem('currentAudioAttachment', JSON.stringify({
        url: audioUrl,
        duration: recordingSeconds
    }));
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
    
    const { url, duration } = JSON.parse(voiceData);
    return {
        data: url,
        type: 'audio/wav',
        duration: duration
    };
}

// Отправка задания на проверку
function submitTask() {
    const task = appData.tasks.find(t => t.id === currentTaskId);
    if (!task) return;
    
    const answerEl = getElement('taskAnswer');
    const attachmentInput = getElement('taskAttachment');
    
    if (!answerEl) return;
    
    const answer = answerEl.value.trim();
    const newAttachments = getAttachmentsFromPreview();
    const voiceAttachment = getVoiceAttachment();
    
    // Проверяем, есть ли хоть что-то
    if (!answer && newAttachments.length === 0 && !voiceAttachment) {
        alert('Пожалуйста, напишите ответ, прикрепите файл или запишите голосовое сообщение!');
        return;
    }
    
    task.answer = answer;
    task.status = 'review';
    task.submittedDate = new Date().toISOString();
    task.needsRevision = false;
    task.parentComment = null;
    
    // Сохраняем вложения
    task.attachments = [...newAttachments];
    
    // Добавляем голосовое сообщение если есть
    if (voiceAttachment) {
        task.attachments.push(voiceAttachment);
        removeVoiceAttachment(); // Очищаем временные данные
    }
    
    saveData();
    closeTaskModal();
    renderChildTasks();
    updateChildStats();
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
    const cookieJarFill = getElement('cookieJarFill');
    
    if (completedEl) completedEl.textContent = completed;
    if (pointsEl) pointsEl.textContent = totalPoints;
    if (levelEl) levelEl.textContent = level;
    
    if (cookieJarFill) {
        const progress = totalTasks > 0 ? (completed / totalTasks) * 100 : 0;
        cookieJarFill.style.height = Math.min(progress, 100) + '%';
    }
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

function saveChildSettings() {
    const nameInput = getElement('settingsName');
    const avatarInput = getElement('settingsAvatar');
    
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    
    if (name) {
        appData.child.name = name;
    }
    
    if (uploadedAvatarData) {
        appData.child.avatar = uploadedAvatarData;
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

// Инициализация страницы родителя
function initParentPage() {
    console.log('Инициализация страницы родителя...');
    updateParentHeader();
    renderParentTasks();
    updateParentStats();
}

// Обновление шапки родителя
function updateParentHeader() {
    const reviewCount = appData.tasks.filter(t => t.status === 'review').length;
    const reviewCountEl = getElement('reviewCount');
    const statusEl = getElement('childStatus');
    
    if (reviewCountEl) reviewCountEl.textContent = reviewCount;
    
    if (statusEl) {
        if (appData.child.isOnline) {
            statusEl.textContent = 'Онлайн';
            statusEl.className = 'status-value online';
        } else {
            statusEl.textContent = 'Офлайн';
            statusEl.className = 'status-value offline';
        }
    }
}

// Обновление статуса онлайн
function updateChildOnlineStatus() {
    if (Math.random() > 0.7) {
        appData.child.isOnline = !appData.child.isOnline;
        saveData();
        if (window.location.pathname.includes('parent.html')) {
            updateParentHeader();
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
    
    return `
        <div class="${classes}" data-task-id="${task.id}" ${onClick}>
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
function openReviewTask(taskId) {
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
        attachmentEl.innerHTML = '';
        if (task.attachments && task.attachments.length > 0) {
            task.attachments.forEach((attachment, index) => {
                if (attachment.type.startsWith('image/')) {
                    attachmentEl.innerHTML += `
                        <div class="attachment-item">
                            <img src="${attachment.data}" alt="Прикрепленное изображение ${index + 1}" 
                                 onclick="openFullscreenImage('${attachment.data}')" style="cursor: pointer;">
                        </div>
                    `;
                } else if (attachment.type.startsWith('video/')) {
                    attachmentEl.innerHTML += `
                        <div class="attachment-item">
                            <video controls src="${attachment.data}"></video>
                        </div>
                    `;
                } else if (attachment.type.startsWith('audio/')) {
                    // ДОБАВЛЯЕМ ОТОБРАЖЕНИЕ АУДИО
                    const duration = attachment.duration ? 
                        ` (${Math.floor(attachment.duration / 60)}:${(attachment.duration % 60).toString().padStart(2, '0')})` : '';
                    attachmentEl.innerHTML += `
                        <div class="attachment-item">
                            <div class="audio-player">
                                <audio controls src="${attachment.data}"></audio>
                                <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">
                                    Голосовое сообщение${duration}
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
        }
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
    if (!document.queryor('#fullscreenStyles')) {
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
        appData.child.level = newLevel;
        appData.child.levelUpNotification = true; // Устанавливаем флаг для уведомления
        saveData();
    }
    
    saveData();
    renderParentTasks();
    updateParentStats();
    closeReviewModal();
    updateParentHeader();
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
    const cookieJarFill = getElement('parentCookieJarFill');
    
    if (completedEl) completedEl.textContent = completed;
    if (pointsEl) pointsEl.textContent = totalPoints;
    if (levelEl) levelEl.textContent = level;
    
    if (cookieJarFill) {
        const progress = totalTasks > 0 ? (completed / totalTasks) * 100 : 0;
        cookieJarFill.style.height = Math.min(progress, 100) + '%';
    }
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
    if (!confirm('Полностью сбросить всю статистику ребенка (уровень и очки)? Это действие нельзя отменить.')) {
        return;
    }
    
    appData.child.level = 1;
    appData.child.points = 0;
    saveData();
    updateParentStats();
    alert('Статистика ребенка полностью сброшена!');
}

// Обновите функцию openParentSettings для отображения текущей статистики
function openParentSettings() {
    const passwordInput = getElement('newPassword');
    const modal = getElement('parentSettingsModal');
    
    if (passwordInput) passwordInput.value = '';
    if (modal) {
        modal.style.display = 'block';
        
        // Обновляем отображение текущей статистики
        const statsInfo = modal.queryor('.reset-section div:last-child');
        if (statsInfo) {
            statsInfo.textContent = `Текущие: Уровень ${appData.child.level}, ${appData.child.points} очков`;
        }
    }
}

function closeParentSettingsModal() {
    const modal = getElement('parentSettingsModal');
    if (modal) modal.style.display = 'none';
}

function saveParentSettings() {
    const passwordInput = getElement('newPassword');
    if (!passwordInput) return;
    
    const newPassword = passwordInput.value.trim();
    
    if (newPassword && newPassword.length >= 4) {
        appData.parentPassword = newPassword;
        saveData();
        alert('Пароль успешно изменен!');
        closeParentSettingsModal();
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

// Принудительная синхронизация данных с анимацией
// Принудительная синхронизация данных
async function forceSync() {
    const syncButton = document.queryor('.btn-sync');
    const originalHTML = syncButton ? syncButton.innerHTML : '';
    
    try {
        console.log('Запуск синхронизации...');
        
        // Показываем анимацию
        if (syncButton) {
            syncButton.classList.add('syncing');
            syncButton.innerHTML = '⏳';
            syncButton.disabled = true;
        }
        
        // Перезагружаем данные из Firebase
        await loadData();
        
        // Обновляем интерфейс
        if (window.location.pathname.includes('child.html')) {
            renderChildTasks();
            updateChildStats();
            updateChildHeader();
        } else if (window.location.pathname.includes('parent.html')) {
            renderParentTasks();
            updateParentStats();
            updateParentHeader();
        }
        
        showSyncNotification('Данные синхронизированы!', 'success');
        
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
        showSyncNotification('Ошибка синхронизации', 'error');
    } finally {
        // Восстанавливаем кнопку
        if (syncButton) {
            syncButton.classList.remove('syncing');
            syncButton.innerHTML = originalHTML;
            syncButton.disabled = false;
        }
    }
}

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

async function checkFirebaseSetup() {
    console.log('🔧 Проверка настройки Firebase:');
    
    // Проверяем конфиг
    console.log('1. Firebase Config:', firebaseConfig);
    console.log('2. Project ID:', firebaseConfig.projectId);
    
    // Проверяем инициализацию
    console.log('3. Firebase App:', app);
    console.log('4. Firestore DB:', db);
    
    // Проверяем аутентификацию
    console.log('5. Current User:', currentUser);
    
    if (currentUser) {
        // Пробуем простую запись
        try {
            await db.collection('test').doc('check').set({
                message: 'Test connection',
                timestamp: new Date()
            });
            console.log('✅ Запись в Firebase работает!');
        } catch (error) {
            console.error('❌ Ошибка записи:', error);
        }
    }
}

// Вызовите в консоли: checkFirebaseSetup()


console.log('Script.js загружен успешно');
