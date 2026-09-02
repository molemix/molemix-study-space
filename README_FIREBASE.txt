MoleMix Учебное пространство — Firebase-версия

ВАЖНО: эту версию лучше открывать через GitHub Pages, а не двойным кликом по index.html.
Firebase Authentication работает с разрешёнными веб-доменами.

Что уже подключено:
- Google Authentication
- Cloud Firestore
- автоматическая синхронизация учеников и занятий между устройствами
- отдельные данные для каждого Google UID
- экспорт JSON-резервной копии

ПЕРЕД ПЕРВЫМ ЗАПУСКОМ:
1. Firebase Console → Firestore Database → Rules.
2. Открой файл firestore.rules из этой папки.
3. Скопируй его целиком в редактор Rules и нажми Publish.
4. Firebase Console → Authentication → Settings → Authorized domains.
5. После публикации сайта добавь домен: molemix.github.io
6. Загрузи содержимое этой папки в GitHub-репозиторий и включи GitHub Pages.
7. Открой сайт по ссылке GitHub Pages и нажми «Войти через Google».

Структура данных Firestore:
/users/{uid}/students/{studentId}
/users/{uid}/lessons/{lessonId}

Правила гарантируют, что пользователь не может читать ветку другого UID.
