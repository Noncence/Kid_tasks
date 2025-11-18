// sw.js
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open('child-tasks').then(cache => 
            cache.addAll(['/', '/styles.css', '/script.js'])
        )
    );
});