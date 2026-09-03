// MoleMix build 2026-09-03.4 — planner
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKUdN_iJZkuuYj94VJPLmEDw2fvkCXIko",
  authDomain: "molemix-study-space-2026.firebaseapp.com",
  projectId: "molemix-study-space-2026",
  storageBucket: "molemix-study-space-2026.firebasestorage.app",
  messagingSenderId: "504264907459",
  appId: "1:504264907459:web:c94e04c4bdcd0bae40a076"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const state = { students: [], lessons: [], materials: [], trainers: [], tasks: [] };
let currentDate = new Date();
currentDate.setDate(1);
let activeStudentId = null;
let currentUser = null;
let stopStudents = null;
let stopLessons = null;
let stopMaterials = null;
let stopTrainers = null;
let stopTasks = null;

const $ = (id) => document.getElementById(id);
const views = {
  calendar: $('calendarView'),
  students: $('studentsView'),
  studentDetail: $('studentDetailView'),
  materials: $('materialsView'),
  trainers: $('trainersView'),
  planner: $('plannerView')
};

const STUDENT_COLORS = [
  '#cdb7f6','#bca7ee','#a894df','#967fce','#d7c7f8',
  '#f6bfd5','#f2aeca','#ed9bbb','#e8c6d6','#f8d8e5',
  '#b9d9ef','#a8cee9','#94c0df','#c5e4f3','#acd8df',
  '#c7e3d0','#b4d9c1','#9fcdae','#d6ead8','#b9dfd7',
  '#f2d9a6','#efd09a','#f5e1b9','#edc9a8','#f3d2bd',
  '#d9c6ba','#cdb7aa','#e1d2c8','#c9b8c8','#d9c6df'
];
function renderStudentColorPalette(selected){
  const palette=$('studentColorPalette');
  if(!palette) return;
  const current=selected || $('studentColor').value || STUDENT_COLORS[0];
  $('studentColor').value=current;
  const colors=STUDENT_COLORS.includes(current)?STUDENT_COLORS:[current,...STUDENT_COLORS];
  palette.innerHTML='';
  colors.forEach(color=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='color-swatch'+(color.toLowerCase()===current.toLowerCase()?' selected':'');
    btn.style.setProperty('--swatch',color);
    btn.setAttribute('aria-label',`Выбрать цвет ${color}`);
    btn.title='Выбрать цвет';
    btn.addEventListener('click',()=>{
      $('studentColor').value=color;
      palette.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('selected'));
      btn.classList.add('selected');
    });
    palette.appendChild(btn);
  });
}

function uid(prefix='id'){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}
function money(v){
  return new Intl.NumberFormat('ru-RU').format(Number(v||0)) + ' ₽';
}
function formatDateRu(dateStr, withYear=true){
  if(!dateStr) return '';
  const d = new Date(dateStr+'T12:00:00');
  return d.toLocaleDateString('ru-RU', withYear ? {day:'numeric',month:'long',year:'numeric'} : {day:'2-digit',month:'2-digit'});
}
function monthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function toast(text){
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>el.classList.remove('show'),2200);
}
function getStudent(id){ return state.students.find(s=>s.id===id); }
function getLesson(id){ return state.lessons.find(l=>l.id===id); }
function safeHttpUrl(value){
  if(!value) return '';
  try{
    const u = new URL(value);
    return (u.protocol==='http:' || u.protocol==='https:') ? u.href : '';
  }catch(e){ return ''; }
}
function userCollection(name){
  if(!currentUser) throw new Error('Пользователь не авторизован');
  return collection(db, 'users', currentUser.uid, name);
}
function userDoc(name,id){
  if(!currentUser) throw new Error('Пользователь не авторизован');
  return doc(db, 'users', currentUser.uid, name, id);
}
async function persistStudent(student){
  const {id,...data}=student;
  await setDoc(userDoc('students',id), {...data, updatedAt:new Date().toISOString()});
}
async function persistLesson(lesson){
  const {id,...data}=lesson;
  await setDoc(userDoc('lessons',id), {...data, updatedAt:new Date().toISOString()});
}
async function persistMaterial(material){
  const {id,...data}=material;
  await setDoc(userDoc('materials',id), {...data, updatedAt:new Date().toISOString()});
}
async function persistTrainer(trainer){
  const {id,...data}=trainer;
  await setDoc(userDoc('trainers',id), {...data, updatedAt:new Date().toISOString()});
}
async function persistTask(task){
  const {id,...data}=task;
  await setDoc(userDoc('tasks',id), {...data, updatedAt:new Date().toISOString()});
}
function renderAll(){
  renderCalendar();
  renderStudents();
  renderMaterials();
  renderTrainers();
  renderPlanner();
  if(activeStudentId && getStudent(activeStudentId)) renderStudentDetail();
}

function startCloudSync(user){
  stopCloudSync();
  $('authMessage').textContent='Загружаю твои данные…';
  stopStudents = onSnapshot(userCollection('students'), snapshot=>{
    state.students = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  }, handleFirestoreError);
  stopLessons = onSnapshot(userCollection('lessons'), snapshot=>{
    state.lessons = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  }, handleFirestoreError);
  stopMaterials = onSnapshot(userCollection('materials'), snapshot=>{
    state.materials = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  }, handleFirestoreError);
  stopTrainers = onSnapshot(userCollection('trainers'), snapshot=>{
    state.trainers = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  }, handleFirestoreError);
  stopTasks = onSnapshot(userCollection('tasks'), snapshot=>{
    state.tasks = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  }, handleFirestoreError);
}
function stopCloudSync(){
  if(stopStudents){stopStudents();stopStudents=null;}
  if(stopLessons){stopLessons();stopLessons=null;}
  if(stopMaterials){stopMaterials();stopMaterials=null;}
  if(stopTrainers){stopTrainers();stopTrainers=null;}
  if(stopTasks){stopTasks();stopTasks=null;}
}
function handleFirestoreError(error){
  console.error(error);
  let text='Не удалось получить доступ к Firestore.';
  if(error?.code==='permission-denied') text='Firestore пока закрыт правилами доступа. Опубликуй правила из файла firestore.rules.';
  toast(text);
}

$('loginBtn').addEventListener('click', async()=>{
  $('loginBtn').disabled=true;
  $('authMessage').textContent='Открываю вход Google…';
  try{
    await signInWithPopup(auth,googleProvider);
  }catch(error){
    console.error(error);
    let msg='Не удалось войти через Google.';
    if(error.code==='auth/unauthorized-domain') msg='Этот адрес сайта ещё не добавлен в Firebase → Authentication → Settings → Authorized domains.';
    if(error.code==='auth/popup-blocked') msg='Браузер заблокировал окно входа. Разреши всплывающие окна и попробуй снова.';
    if(error.code==='auth/popup-closed-by-user') msg='Окно входа было закрыто.';
    $('authMessage').textContent=msg;
  }finally{
    $('loginBtn').disabled=false;
  }
});
$('logoutBtn').addEventListener('click', async()=>{
  try{ await signOut(auth); }catch(e){ console.error(e); toast('Не удалось выйти'); }
});

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(user){
    $('authGate').hidden=true;
    $('appShell').hidden=false;
    $('userEmail').textContent=user.email||'Google';
    if(user.photoURL){ $('userAvatar').src=user.photoURL; $('userAvatar').hidden=false; }
    else $('userAvatar').hidden=true;
    startCloudSync(user);
  }else{
    stopCloudSync();
    state.students=[]; state.lessons=[]; state.materials=[]; state.trainers=[]; state.tasks=[]; activeStudentId=null;
    $('appShell').hidden=true;
    $('authGate').hidden=false;
    $('authMessage').textContent='Войди в свой Google-аккаунт, чтобы загрузить учеников и занятия.';
  }
});

function switchView(name){
  const target = views[name];
  if(!target){
    console.error(`Неизвестная страница: ${name}`);
    toast('Не удалось открыть раздел. Обнови страницу.');
    return;
  }
  Object.values(views).filter(Boolean).forEach(v=>v.classList.remove('active-view'));
  target.classList.add('active-view');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  if(name==='calendar') renderCalendar();
  if(name==='students') renderStudents();
  if(name==='materials') renderMaterials();
  if(name==='trainers') renderTrainers();
  if(name==='planner') renderPlanner();
}

document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
$('backToStudents').addEventListener('click',()=>switchView('students'));

$('prevMonth').addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); });
$('nextMonth').addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); });
$('todayBtn').addEventListener('click',()=>{ currentDate = new Date(); currentDate.setDate(1); renderCalendar(); });

function renderCalendar(){
  const title = currentDate.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  $('monthTitle').textContent = title.charAt(0).toUpperCase()+title.slice(1);

  const key = monthKey(currentDate);
  const monthLessons = state.lessons.filter(l=>l.date?.startsWith(key));
  const todayIso = toISODate(new Date());
  const earned = monthLessons.filter(l=>l.conducted && !l.cancelled).reduce((s,l)=>s+Number(l.price||0),0);
  const future = monthLessons.filter(l=>!l.conducted && !l.cancelled && l.date >= todayIso).reduce((s,l)=>s+Number(l.price||0),0);
  const conducted = monthLessons.filter(l=>l.conducted && !l.cancelled).length;
  $('paidTotal').textContent = money(earned);
  $('unpaidTotal').textContent = money(future);
  $('conductedCount').textContent = conducted;

  const grid = $('calendarGrid');
  grid.innerHTML='';
  const year=currentDate.getFullYear(), month=currentDate.getMonth();
  const first = new Date(year,month,1);
  const startOffset = (first.getDay()+6)%7;
  const start = new Date(year,month,1-startOffset);
  const today = new Date();
  today.setHours(0,0,0,0);

  for(let i=0;i<42;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const iso = toISODate(d);
    const cell = document.createElement('div');
    cell.className='day-cell';
    if(d.getMonth()!==month) cell.classList.add('outside');
    if(d.getTime()===today.getTime()) cell.classList.add('today');
    cell.innerHTML=`<div class="day-head"><span class="day-number">${d.getDate()}</span><button class="add-lesson-mini" title="Добавить занятие">+</button></div><div class="lessons-list"></div>`;
    cell.querySelector('.add-lesson-mini').addEventListener('click',(e)=>{e.stopPropagation();openLessonModal(null,iso);});
    cell.addEventListener('dblclick',()=>openLessonModal(null,iso));
    const list = cell.querySelector('.lessons-list');
    const lessons = state.lessons.filter(l=>l.date===iso).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    lessons.forEach(l=>list.appendChild(renderLessonChip(l)));
    grid.appendChild(cell);
  }
}
function renderLessonChip(lesson){
  const s = getStudent(lesson.studentId);
  const btn = document.createElement('button');
  btn.className='lesson-chip'+(lesson.cancelled?' cancelled':'');
  btn.style.setProperty('--student-color', s?.color || '#cdb7f6');
  btn.innerHTML=`
    <div class="lesson-line"><strong>${lesson.time||'—'}</strong><span class="lesson-name">${escapeHtml(s?.name||'Ученик')}</span></div>
    <div class="lesson-meta"><span>${money(lesson.price)}</span><span class="pay-dot ${lesson.paid?'paid':''}">${lesson.paid?'✓':'○'}</span></div>`;
  btn.addEventListener('click',()=>openLessonModal(lesson.id));
  return btn;
}

function renderStudents(){
  const grid=$('studentsGrid');
  const students=state.students.filter(s=>!s.archived).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  if(!students.length){
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><strong>Пока нет учеников</strong><br><span>Добавь первого ученика — после этого его можно будет ставить в календарь.</span></div>`;
    return;
  }
  grid.innerHTML='';
  students.forEach(s=>{
    const lessons=state.lessons.filter(l=>l.studentId===s.id && !l.cancelled);
    const paid=lessons.filter(l=>l.paid).reduce((sum,l)=>sum+Number(l.price||0),0);
    const progresses=lessons.flatMap(l=>(l.topics||[]).map(t=>Number(t.progress)).filter(Boolean));
    const avg=progresses.length?(progresses.reduce((a,b)=>a+b,0)/progresses.length).toFixed(1):'—';
    const card=document.createElement('button');
    card.className='student-card';
    card.style.setProperty('--student-color',s.color||'#cdb7f6');
    card.innerHTML=`<h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.className||'Класс не указан')} · ${money(s.price)} / занятие</p>
      <div class="student-stats"><div class="student-stat"><strong>${lessons.length}</strong><span>занятий</span></div><div class="student-stat"><strong>${avg}${avg==='—'?'':'/10'}</strong><span>средний прогресс</span></div><div class="student-stat"><strong>${money(paid)}</strong><span>получено</span></div></div>`;
    card.addEventListener('click',()=>openStudentDetail(s.id));
    grid.appendChild(card);
  });
}

function openStudentDetail(id){
  activeStudentId=id;
  renderStudentDetail();
  switchView('studentDetail');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
}
function renderStudentDetail(){
  const s=getStudent(activeStudentId);
  if(!s) return switchView('students');
  const lessons=state.lessons.filter(l=>l.studentId===s.id).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const activeLessons=lessons.filter(l=>!l.cancelled);
  const paid=activeLessons.filter(l=>l.paid).reduce((sum,l)=>sum+Number(l.price||0),0);
  const progresses=activeLessons.flatMap(l=>(l.topics||[]).map(t=>Number(t.progress)).filter(Boolean));
  const avg=progresses.length?(progresses.reduce((a,b)=>a+b,0)/progresses.length).toFixed(1):'—';
  const html=`
    <div class="detail-header" style="--student-color:${s.color||'#cdb7f6'}">
      <div class="detail-title">
        <div class="eyebrow">Личная карточка ученика</div>
        <h2>${escapeHtml(s.name)}</h2>
        <div class="meta">${escapeHtml(s.className||'Класс не указан')} · ${money(s.price)} / занятие</div>
        <div class="detail-summary">
          <div><strong>${activeLessons.length}</strong><span>занятий</span></div>
          <div><strong>${avg}${avg==='—'?'':'/10'}</strong><span>средний прогресс</span></div>
          <div><strong>${money(paid)}</strong><span>получено</span></div>
        </div>
      </div>
      <button class="ghost-btn" id="editStudentProfile">Редактировать профиль</button>
    </div>
    <div class="profile-info-grid">
      ${profileBox('Цель',s.goal)}
      ${profileBox('Нынешний уровень',s.level)}
      ${profileBox('Контакты',s.contacts)}
      ${lessonLinkBox(s.lessonLink)}
      ${profileBox('Общая заметка',s.note)}
    </div>
    <div class="journal">
      <div class="journal-head"><div><div class="eyebrow">История занятий</div><h3>Журнал</h3></div><button class="primary-btn" id="addLessonForStudent">+ Занятие</button></div>
      ${lessons.length ? renderJournalTable(lessons) : '<div class="empty-state" style="margin:16px">У этого ученика пока нет занятий.</div>'}
    </div>`;
  $('studentDetail').innerHTML=html;
  $('editStudentProfile').addEventListener('click',()=>openStudentModal(s.id));
  $('addLessonForStudent').addEventListener('click',()=>openLessonModal(null,toISODate(new Date()),s.id));
  document.querySelectorAll('[data-open-lesson]').forEach(el=>el.addEventListener('click',()=>openLessonModal(el.dataset.openLesson)));
}
function profileBox(label,value){return `<div class="profile-info"><span>${label}</span><p class="${value?'':'muted-empty'}">${escapeHtml(value||'Не заполнено')}</p></div>`}
function lessonLinkBox(value){
  const url=safeHttpUrl(value);
  return `<div class="profile-info"><span>Ссылка на урок</span>${url?`<a class="lesson-link-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Перейти на урок ↗</a>`:'<p class="muted-empty">Не заполнено</p>'}</div>`;
}
function renderJournalTable(lessons){
  const rows=lessons.map(l=>{
    const topics=(l.topics||[]).length ? l.topics.map(t=>`<span class="topic-pill">${escapeHtml(t.name||'Без темы')} <span class="progress-badge">${t.progress?`${t.progress}/10`:'—'}</span></span>`).join('') : '<span class="muted-empty">—</span>';
    const hw=homeworkBadge(l.homework);
    const notes=notesBadge(l.notes);
    const pay=l.cancelled?'<span class="status-badge bad">Отменено</span>':(l.paid?'<span class="status-badge good">✓ '+money(l.price)+'</span>':'<span class="status-badge wait">○ '+money(l.price)+'</span>');
    return `<tr data-open-lesson="${l.id}" style="cursor:pointer">
      <td data-label="Дата">${formatDateRu(l.date,false)}<br><small>${escapeHtml(l.time||'')}</small></td>
      <td data-label="Тема">${topics}</td>
      <td data-label="ДЗ">${hw}</td>
      <td data-label="Конспект">${notes}</td>
      <td data-label="Оплата">${pay}</td>
      <td data-label="Комментарий">${escapeHtml(l.comment||'—')}</td>
    </tr>`;
  }).join('');
  return `<table class="journal-table"><thead><tr><th>Дата</th><th>Тема / прогресс</th><th>ДЗ</th><th>Конспект</th><th>Оплата</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function homeworkBadge(v){
  if(v==='sent') return '<span class="status-badge good">✓ Отправлено</span>';
  if(v==='todo') return '<span class="status-badge wait">⏳ Нужно отправить</span>';
  return '<span class="status-badge none">— Не задано</span>';
}
function notesBadge(v){
  if(v==='sent') return '<span class="status-badge good">✓ Отправлен</span>';
  if(v==='todo') return '<span class="status-badge wait">⏳ Нужно отправить</span>';
  return '<span class="status-badge none">— Не нужен</span>';
}


function materialLevelMeta(level){
  if(level==='beginner') return {label:'Начальный', className:'beginner'};
  if(level==='advanced') return {label:'Сложный', className:'advanced'};
  return {label:'Средний', className:'medium'};
}
function normalizeSearch(value=''){
  return String(value).trim().toLocaleLowerCase('ru-RU');
}
function populateMaterialClassFilter(){
  const select=$('materialClassFilter');
  if(!select) return;
  const previous=select.value || 'all';
  const classes=[...new Set(state.materials.map(m=>(m.className||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ru',{numeric:true,sensitivity:'base'}));
  select.innerHTML='<option value="all">Все</option>' + classes.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  select.value=classes.includes(previous)?previous:'all';
}
function renderMaterials(){
  const grid=$('materialsGrid');
  if(!grid) return;
  populateMaterialClassFilter();
  const query=normalizeSearch($('materialSearch')?.value||'');
  const classFilter=$('materialClassFilter')?.value||'all';
  const levelFilter=$('materialLevelFilter')?.value||'all';
  const materials=[...state.materials]
    .filter(m=>!query || normalizeSearch(m.name).includes(query))
    .filter(m=>classFilter==='all' || (m.className||'')===classFilter)
    .filter(m=>levelFilter==='all' || (m.level||'medium')===levelFilter)
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru',{numeric:true,sensitivity:'base'}));

  const count=$('materialsCount');
  if(count){
    const total=state.materials.length;
    count.textContent=total ? `Показано: ${materials.length} из ${total}` : '';
  }
  if(!state.materials.length){
    grid.innerHTML=`<div class="empty-state materials-empty"><strong>Библиотека пока пустая</strong><br><span>Добавь первый конспект или PDF, чтобы больше не искать материалы по папкам.</span></div>`;
    return;
  }
  if(!materials.length){
    grid.innerHTML=`<div class="empty-state materials-empty"><strong>Ничего не найдено</strong><br><span>Попробуй изменить поиск или сбросить фильтры.</span></div>`;
    return;
  }
  grid.innerHTML='';
  materials.forEach(m=>{
    const meta=materialLevelMeta(m.level);
    const url=safeHttpUrl(m.link);
    const card=document.createElement('article');
    card.className='material-card';
    card.innerHTML=`
      <div class="material-card-top">
        <div class="material-title-wrap">
          <h3>${escapeHtml(m.name||'Без названия')}</h3>
          <div class="material-tags">
            ${m.className?`<span class="material-tag class-tag">${escapeHtml(m.className)}</span>`:''}
            <span class="material-tag level-tag ${meta.className}">${meta.label}</span>
          </div>
        </div>
        <button type="button" class="material-edit-btn" data-edit-material="${m.id}" aria-label="Редактировать материал" title="Редактировать">•••</button>
      </div>
      <p class="material-comment ${m.comment?'':'muted-empty'}">${escapeHtml(m.comment||'Комментарий не добавлен')}</p>
      <div class="material-card-actions">
        ${url?`<a class="material-open-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Открыть PDF ↗</a>`:'<span class="material-no-link">Ссылка не добавлена</span>'}
        <button type="button" class="ghost-btn material-edit-text" data-edit-material="${m.id}">Редактировать</button>
      </div>`;
    card.querySelectorAll('[data-edit-material]').forEach(btn=>btn.addEventListener('click',()=>openMaterialModal(m.id)));
    grid.appendChild(card);
  });
}

$('materialSearch').addEventListener('input',renderMaterials);
$('materialClassFilter').addEventListener('change',renderMaterials);
$('materialLevelFilter').addEventListener('change',renderMaterials);
$('clearMaterialFilters').addEventListener('click',()=>{
  $('materialSearch').value='';
  $('materialClassFilter').value='all';
  $('materialLevelFilter').value='all';
  renderMaterials();
});
$('addMaterialBtn').addEventListener('click',()=>openMaterialModal());
function openMaterialModal(id=null){
  const m=id?state.materials.find(x=>x.id===id):null;
  $('materialModalTitle').textContent=m?'Редактировать материал':'Новый материал';
  $('materialId').value=m?.id||'';
  $('materialName').value=m?.name||'';
  $('materialClass').value=m?.className||'';
  $('materialLevel').value=m?.level||'medium';
  $('materialLink').value=m?.link||'';
  $('materialComment').value=m?.comment||'';
  $('deleteMaterialBtn').classList.toggle('hidden',!m);
  $('materialModalBackdrop').hidden=false;
  setTimeout(()=>$('materialName').focus(),0);
}
$('materialForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const id=$('materialId').value || uid('material');
  const existing=state.materials.find(x=>x.id===id);
  const link=$('materialLink').value.trim();
  if(link && !safeHttpUrl(link)) return toast('Ссылка должна начинаться с http:// или https://');
  const material={
    ...(existing||{}), id,
    name:$('materialName').value.trim(),
    className:$('materialClass').value.trim(),
    level:$('materialLevel').value,
    link,
    comment:$('materialComment').value.trim(),
    createdAt:existing?.createdAt||new Date().toISOString()
  };
  if(!material.name) return toast('Напиши название материала');
  try{
    await persistMaterial(material);
    closeModal('material');
    toast(existing?'Материал обновлён':'Материал добавлен в библиотеку');
  }catch(error){console.error(error);toast('Не удалось сохранить материал');}
});
$('deleteMaterialBtn').addEventListener('click',async()=>{
  const id=$('materialId').value;
  const m=state.materials.find(x=>x.id===id);
  if(!id||!m) return;
  if(confirm(`Удалить материал «${m.name}» из библиотеки? Сам PDF по ссылке удалён не будет.`)){
    try{
      await deleteDoc(userDoc('materials',id));
      closeModal('material');
      toast('Материал удалён из библиотеки');
    }catch(error){console.error(error);toast('Не удалось удалить материал');}
  }
});


function populateTrainerClassFilter(){
  const select=$('trainerClassFilter');
  if(!select) return;
  const previous=select.value || 'all';
  const classes=[...new Set(state.trainers.map(t=>(t.className||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ru',{numeric:true,sensitivity:'base'}));
  select.innerHTML='<option value="all">Все</option>' + classes.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  select.value=classes.includes(previous)?previous:'all';
}
function renderTrainers(){
  const grid=$('trainersGrid');
  if(!grid) return;
  populateTrainerClassFilter();
  const query=normalizeSearch($('trainerSearch')?.value||'');
  const classFilter=$('trainerClassFilter')?.value||'all';
  const trainers=[...state.trainers]
    .filter(t=>!query || normalizeSearch(t.name).includes(query))
    .filter(t=>classFilter==='all' || (t.className||'')===classFilter)
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru',{numeric:true,sensitivity:'base'}));

  const count=$('trainersCount');
  if(count){
    const total=state.trainers.length;
    count.textContent=total ? `Показано: ${trainers.length} из ${total}` : '';
  }
  if(!state.trainers.length){
    grid.innerHTML=`<div class="empty-state trainers-empty"><strong>Тренажёров пока нет</strong><br><span>Добавь первый тренажёр — его ссылка всегда будет под рукой.</span></div>`;
    return;
  }
  if(!trainers.length){
    grid.innerHTML=`<div class="empty-state trainers-empty"><strong>Ничего не найдено</strong><br><span>Попробуй изменить поиск или сбросить фильтр.</span></div>`;
    return;
  }
  grid.innerHTML='';
  trainers.forEach(t=>{
    const url=safeHttpUrl(t.link);
    const card=document.createElement('article');
    card.className='trainer-card';
    card.innerHTML=`
      <div class="trainer-card-top">
        <div class="trainer-title-wrap">
          <h3>${escapeHtml(t.name||'Без названия')}</h3>
          <div class="trainer-tags">
            ${t.className?`<span class="trainer-tag class-tag">${escapeHtml(t.className)}</span>`:''}
          </div>
        </div>
        <button type="button" class="trainer-edit-btn" data-edit-trainer="${t.id}" aria-label="Редактировать тренажёр" title="Редактировать">•••</button>
      </div>
      <div class="trainer-card-actions">
        ${url?`<a class="trainer-open-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Открыть тренажёр ↗</a>`:'<span class="trainer-no-link">Ссылка не добавлена</span>'}
        <button type="button" class="ghost-btn trainer-edit-text" data-edit-trainer="${t.id}">Редактировать</button>
      </div>`;
    card.querySelectorAll('[data-edit-trainer]').forEach(btn=>btn.addEventListener('click',()=>openTrainerModal(t.id)));
    grid.appendChild(card);
  });
}

$('trainerSearch').addEventListener('input',renderTrainers);
$('trainerClassFilter').addEventListener('change',renderTrainers);
$('clearTrainerFilters').addEventListener('click',()=>{
  $('trainerSearch').value='';
  $('trainerClassFilter').value='all';
  renderTrainers();
});
$('addTrainerBtn').addEventListener('click',()=>openTrainerModal());
function openTrainerModal(id=null){
  const t=id?state.trainers.find(x=>x.id===id):null;
  $('trainerModalTitle').textContent=t?'Редактировать тренажёр':'Новый тренажёр';
  $('trainerId').value=t?.id||'';
  $('trainerName').value=t?.name||'';
  $('trainerClass').value=t?.className||'';
  $('trainerLink').value=t?.link||'';
  $('deleteTrainerBtn').classList.toggle('hidden',!t);
  $('trainerModalBackdrop').hidden=false;
  setTimeout(()=>$('trainerName').focus(),0);
}
$('trainerForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const id=$('trainerId').value || uid('trainer');
  const existing=state.trainers.find(x=>x.id===id);
  const link=$('trainerLink').value.trim();
  if(!safeHttpUrl(link)) return toast('Вставь корректную ссылку http:// или https://');
  const trainer={
    ...(existing||{}), id,
    name:$('trainerName').value.trim(),
    className:$('trainerClass').value.trim(),
    link,
    createdAt:existing?.createdAt||new Date().toISOString()
  };
  if(!trainer.name) return toast('Напиши название тренажёра');
  if(!trainer.className) return toast('Укажи класс');
  try{
    await persistTrainer(trainer);
    closeModal('trainer');
    toast(existing?'Тренажёр обновлён':'Тренажёр добавлен');
  }catch(error){console.error(error);toast('Не удалось сохранить тренажёр');}
});
$('deleteTrainerBtn').addEventListener('click',async()=>{
  const id=$('trainerId').value;
  const t=state.trainers.find(x=>x.id===id);
  if(!id||!t) return;
  if(confirm(`Удалить тренажёр «${t.name}» из списка? Сам сайт удалён не будет.`)){
    try{
      await deleteDoc(userDoc('trainers',id));
      closeModal('trainer');
      toast('Тренажёр удалён из списка');
    }catch(error){console.error(error);toast('Не удалось удалить тренажёр');}
  }
});


function plannerTodayKey(){ return toISODate(new Date()); }
function compareTaskDates(a,b){
  const ad=a.dueDate||'9999-12-31', bd=b.dueDate||'9999-12-31';
  if(ad!==bd) return ad.localeCompare(bd);
  return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
}
function plannerDateLabel(dateStr){
  if(!dateStr) return '';
  const today=plannerTodayKey();
  const tomorrowDate=new Date(today+'T12:00:00');
  tomorrowDate.setDate(tomorrowDate.getDate()+1);
  const tomorrow=toISODate(tomorrowDate);
  if(dateStr===today) return 'сегодня';
  if(dateStr===tomorrow) return 'завтра';
  const d=new Date(dateStr+'T12:00:00');
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
}
function taskRow(task, completed=false){
  const row=document.createElement('article');
  row.className='planner-task'+(completed?' is-completed':'');
  const checkbox=document.createElement('button');
  checkbox.type='button';
  checkbox.className='task-check';
  checkbox.setAttribute('aria-label',completed?'Вернуть задачу в список':'Отметить задачу выполненной');
  checkbox.innerHTML=completed?'✓':'';
  checkbox.addEventListener('click',async()=>{
    try{
      await persistTask({...task,completed:!task.completed,completedAt:task.completed?null:new Date().toISOString()});
    }catch(error){console.error(error);toast('Не удалось изменить задачу');}
  });
  const content=document.createElement('button');
  content.type='button';
  content.className='task-content';
  const due=task.dueDate?`<span class="task-date${task.dueDate<plannerTodayKey()&&!completed?' overdue-date':''}">${escapeHtml(plannerDateLabel(task.dueDate))}</span>`:'';
  content.innerHTML=`<strong>${escapeHtml(task.text||'Без названия')}</strong>${due}`;
  content.addEventListener('click',()=>openTaskModal(task.id));
  const edit=document.createElement('button');
  edit.type='button'; edit.className='task-edit-btn'; edit.textContent='•••'; edit.title='Редактировать'; edit.setAttribute('aria-label','Редактировать задачу');
  edit.addEventListener('click',()=>openTaskModal(task.id));
  row.append(checkbox,content,edit);
  return row;
}
function renderTaskGroup(sectionId,listId,countId,tasks){
  const section=$(sectionId), list=$(listId), count=$(countId);
  if(!section||!list) return;
  section.hidden=!tasks.length;
  if(count) count.textContent=tasks.length?String(tasks.length):'';
  list.innerHTML='';
  tasks.forEach(t=>list.appendChild(taskRow(t,false)));
}
function renderPlanner(){
  const today=plannerTodayKey();
  const active=state.tasks.filter(t=>!t.completed);
  const completed=state.tasks.filter(t=>!!t.completed).sort((a,b)=>String(b.completedAt||b.updatedAt||'').localeCompare(String(a.completedAt||a.updatedAt||'')));
  const overdue=active.filter(t=>t.dueDate && t.dueDate<today).sort(compareTaskDates);
  const todayTasks=active.filter(t=>t.dueDate===today).sort(compareTaskDates);
  const soon=active.filter(t=>t.dueDate && t.dueDate>today).sort(compareTaskDates);
  const noDate=active.filter(t=>!t.dueDate).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));

  renderTaskGroup('overdueTaskSection','overdueTaskList','overdueTaskCount',overdue);
  renderTaskGroup('todayTaskSection','todayTaskList','todayTaskCount',todayTasks);
  renderTaskGroup('soonTaskSection','soonTaskList','soonTaskCount',soon);
  renderTaskGroup('noDateTaskSection','noDateTaskList','noDateTaskCount',noDate);

  $('plannerSummary').textContent=`Сегодня: ${todayTasks.length} ${pluralRu(todayTasks.length,'дело','дела','дел')} · Выполнено: ${completed.length}`;
  $('plannerEmpty').hidden=active.length!==0 || completed.length!==0;
  $('completedTasksDetails').hidden=!completed.length;
  $('completedTaskCount').textContent=completed.length;
  $('completedTaskList').innerHTML='';
  completed.forEach(t=>$('completedTaskList').appendChild(taskRow(t,true)));
}
function pluralRu(n,one,few,many){
  const a=Math.abs(n)%100,b=a%10;
  if(a>10&&a<20)return many;
  if(b>1&&b<5)return few;
  if(b===1)return one;
  return many;
}
$('quickTaskForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const text=$('quickTaskText').value.trim();
  if(!text) return;
  const task={id:uid('task'),text,dueDate:$('quickTaskDate').value||'',completed:false,completedAt:null,createdAt:new Date().toISOString()};
  try{
    await persistTask(task);
    $('quickTaskText').value=''; $('quickTaskDate').value=''; $('quickTaskText').focus();
    toast('Добавлено в планер');
  }catch(error){console.error(error);toast('Не удалось добавить задачу');}
});
function openTaskModal(id){
  const task=state.tasks.find(t=>t.id===id); if(!task)return;
  $('taskId').value=task.id;
  $('taskText').value=task.text||'';
  $('taskDate').value=task.dueDate||'';
  $('taskModalBackdrop').hidden=false;
  setTimeout(()=>$('taskText').focus(),0);
}
$('taskForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const id=$('taskId').value;
  const existing=state.tasks.find(t=>t.id===id); if(!existing)return;
  const text=$('taskText').value.trim(); if(!text)return toast('Напиши задачу');
  try{
    await persistTask({...existing,text,dueDate:$('taskDate').value||''});
    closeModal('task'); toast('Задача обновлена');
  }catch(error){console.error(error);toast('Не удалось сохранить задачу');}
});
$('deleteTaskBtn').addEventListener('click',async()=>{
  const id=$('taskId').value; const task=state.tasks.find(t=>t.id===id); if(!task)return;
  if(confirm(`Удалить задачу «${task.text}»?`)){
    try{await deleteDoc(userDoc('tasks',id));closeModal('task');toast('Задача удалена');}
    catch(error){console.error(error);toast('Не удалось удалить задачу');}
  }
});
$('clearCompletedTasks').addEventListener('click',async()=>{
  const done=state.tasks.filter(t=>t.completed); if(!done.length)return;
  if(!confirm(`Удалить выполненные задачи (${done.length})?`))return;
  try{
    await Promise.all(done.map(t=>deleteDoc(userDoc('tasks',t.id))));
    toast('Выполненные очищены');
  }catch(error){console.error(error);toast('Не удалось очистить выполненные');}
});

$('addStudentBtn').addEventListener('click',()=>openStudentModal());
function openStudentModal(id=null){
  const s=id?getStudent(id):null;
  $('studentModalTitle').textContent=s?'Редактировать ученика':'Новый ученик';
  $('studentId').value=s?.id||'';
  $('studentName').value=s?.name||'';
  $('studentClass').value=s?.className||'';
  $('studentPrice').value=s?.price||'';
  renderStudentColorPalette(s?.color||'#cdb7f6');
  $('studentGoal').value=s?.goal||'';
  $('studentLevel').value=s?.level||'';
  $('studentContacts').value=s?.contacts||'';
  $('studentLessonLink').value=s?.lessonLink||'';
  $('studentNote').value=s?.note||'';
  $('archiveStudentBtn').classList.toggle('hidden',!s);
  $('studentModalBackdrop').hidden=false;
}
$('studentForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const id=$('studentId').value || uid('student');
  const existing=getStudent(id);
  const student={
    ...(existing||{}), id,
    name:$('studentName').value.trim(),
    className:$('studentClass').value.trim(),
    price:Number($('studentPrice').value||0),
    color:$('studentColor').value,
    goal:$('studentGoal').value.trim(),
    level:$('studentLevel').value.trim(),
    contacts:$('studentContacts').value.trim(),
    lessonLink:$('studentLessonLink').value.trim(),
    note:$('studentNote').value.trim(),
    archived:existing?.archived||false,
    createdAt:existing?.createdAt||new Date().toISOString()
  };
  try{
    await persistStudent(student);
    closeModal('student');
    toast('Профиль сохранён в облаке');
  }catch(error){console.error(error);toast('Не удалось сохранить профиль');}
});
$('archiveStudentBtn').addEventListener('click',async()=>{
  const id=$('studentId').value; const s=getStudent(id); if(!s)return;
  if(confirm(`Архивировать ученика «${s.name}»? История занятий сохранится.`)){
    try{ await persistStudent({...s,archived:true}); closeModal('student'); switchView('students'); toast('Ученик архивирован'); }
    catch(error){console.error(error);toast('Не удалось архивировать');}
  }
});

function populateStudentSelect(selectedId=''){
  const select=$('lessonStudent');
  const students=state.students.filter(s=>!s.archived).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  select.innerHTML=students.length?'<option value="">Выберите ученика</option>':'<option value="">Сначала добавьте ученика</option>';
  students.forEach(s=>{
    const o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o);
  });
  select.value=selectedId||'';
}
$('lessonStudent').addEventListener('change',()=>{
  const s=getStudent($('lessonStudent').value); if(s && !$('lessonId').value) $('lessonPrice').value=s.price||'';
});
$('addTopicBtn').addEventListener('click',()=>addTopicRow());
function addTopicRow(topic={name:'',progress:''}){
  const row=document.createElement('div');
  row.className='topic-row';
  row.innerHTML=`<input type="text" class="topic-name" placeholder="Название темы" value="${escapeAttr(topic.name||'')}"><select class="topic-progress"><option value="">— /10</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${Number(topic.progress)===i+1?'selected':''}>${i+1}/10</option>`).join('')}</select><button type="button" class="remove-topic">×</button>`;
  row.querySelector('.remove-topic').addEventListener('click',()=>row.remove());
  $('topicsEditor').appendChild(row);
}
function openLessonModal(id=null,date=null,studentId=null){
  if(!state.students.filter(s=>!s.archived).length){ toast('Сначала добавь ученика'); switchView('students'); return; }
  const l=id?getLesson(id):null;
  $('lessonModalTitle').textContent=l?'Редактировать занятие':'Новое занятие';
  $('lessonId').value=l?.id||'';
  populateStudentSelect(l?.studentId||studentId||'');
  $('lessonDate').value=l?.date||date||toISODate(new Date());
  $('lessonTime').value=l?.time||'18:00';
  const s=getStudent(l?.studentId||studentId);
  $('lessonPrice').value=l?.price ?? s?.price ?? '';
  $('lessonHomework').value=l?.homework||'none';
  $('lessonNotes').value=l?.notes||'none';
  $('lessonComment').value=l?.comment||'';
  $('lessonConducted').checked=!!l?.conducted;
  $('lessonPaid').checked=!!l?.paid;
  $('lessonCancelled').checked=!!l?.cancelled;
  $('topicsEditor').innerHTML='';
  (l?.topics?.length?l.topics:[{name:'',progress:''}]).forEach(addTopicRow);
  $('deleteLessonBtn').classList.toggle('hidden',!l);
  $('duplicateLessonBtn').classList.toggle('hidden',!l);
  $('lessonModalBackdrop').hidden=false;
}
$('lessonForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const existingId=$('lessonId').value;
  const id=existingId||uid('lesson');
  const existing=getLesson(id);
  const topics=[...document.querySelectorAll('.topic-row')].map(r=>({name:r.querySelector('.topic-name').value.trim(),progress:Number(r.querySelector('.topic-progress').value)||null})).filter(t=>t.name||t.progress);
  const lesson={
    ...(existing||{}), id,
    studentId:$('lessonStudent').value,
    date:$('lessonDate').value,
    time:$('lessonTime').value,
    price:Number($('lessonPrice').value||0),
    topics,
    homework:$('lessonHomework').value,
    notes:$('lessonNotes').value,
    comment:$('lessonComment').value.trim(),
    conducted:$('lessonConducted').checked,
    paid:$('lessonPaid').checked,
    cancelled:$('lessonCancelled').checked,
    createdAt:existing?.createdAt||new Date().toISOString()
  };
  if(!lesson.studentId) return toast('Выбери ученика');
  if(lesson.cancelled) lesson.conducted=false;
  try{
    await persistLesson(lesson);
    closeModal('lesson');
    toast('Занятие сохранено в облаке');
  }catch(error){console.error(error);toast('Не удалось сохранить занятие');}
});
$('duplicateLessonBtn').addEventListener('click',()=>{
  const sourceDate=$('lessonDate').value || toISODate(new Date());
  const next=new Date(sourceDate+'T12:00:00');
  next.setDate(next.getDate()+7);
  $('lessonId').value='';
  $('lessonModalTitle').textContent='Дубликат занятия';
  $('lessonDate').value=toISODate(next);
  $('lessonHomework').value='none';
  $('lessonNotes').value='none';
  $('lessonComment').value='';
  $('lessonConducted').checked=false;
  $('lessonPaid').checked=false;
  $('lessonCancelled').checked=false;
  $('topicsEditor').innerHTML='';
  addTopicRow();
  $('deleteLessonBtn').classList.add('hidden');
  $('duplicateLessonBtn').classList.add('hidden');
  $('lessonDate').focus();
  toast('Создан дубликат на следующую неделю — дату можно изменить');
});

$('deleteLessonBtn').addEventListener('click',async()=>{
  const id=$('lessonId').value; if(!id)return;
  if(confirm('Удалить занятие? Для отменённых занятий лучше использовать статус «Отменено» — так история сохранится.')){
    try{ await deleteDoc(userDoc('lessons',id)); closeModal('lesson'); toast('Занятие удалено'); }
    catch(error){console.error(error);toast('Не удалось удалить занятие');}
  }
});

document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
[$('lessonModalBackdrop'),$('studentModalBackdrop'),$('materialModalBackdrop'),$('trainerModalBackdrop'),$('taskModalBackdrop')].forEach(backdrop=>backdrop.addEventListener('click',(e)=>{if(e.target===backdrop) backdrop.hidden=true;}));
function closeModal(type){
  const ids={lesson:'lessonModalBackdrop',student:'studentModalBackdrop',material:'materialModalBackdrop',trainer:'trainerModalBackdrop',task:'taskModalBackdrop'};
  if(ids[type]) $(ids[type]).hidden=true;
}

$('exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),ownerUid:currentUser?.uid||null,...state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`molemix-backup-${toISODate(new Date())}.json`; a.click(); URL.revokeObjectURL(url); toast('Резервная копия скачана');
});

function toISODate(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function escapeHtml(str=''){return String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttr(str=''){return escapeHtml(str);}

renderCalendar();
renderStudents();
renderMaterials();
renderTrainers();
renderPlanner();
