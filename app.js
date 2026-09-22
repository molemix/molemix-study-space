// MoleMix build 2026-09-15.1 — personal calendar, categories and monthly expenses
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
  getDocs
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

const state = { students: [], lessons: [], studentTopics: [], materials: [], materialFolders: [], trainers: [], trainerFolders: [], tasks: [], personalEvents: [], personalCategories: [] };
let currentDate = new Date();
currentDate.setDate(1);
let currentCalendarMode = 'study';
let activeStudentId = null;
let activeStudentTab = 'lessons';
let activeMaterialFolderId = null;
let activeTrainerFolderId = null;
let currentUser = null;
let currentView = 'calendar';
let lessonsSyncReady = false;
let studentTopicsSyncReady = false;
let initialTopicMigrationDone = false;
const loadedCollections = new Set();
const loadingCollections = new Map();
let renderScheduled = false;
let lastAutoRefreshAt = 0;

const COLLECTION_STATE_KEYS = {
  students:'students',
  lessons:'lessons',
  studentTopics:'studentTopics',
  materials:'materials',
  materialFolders:'materialFolders',
  trainers:'trainers',
  trainerFolders:'trainerFolders',
  tasks:'tasks',
  personalEvents:'personalEvents',
  personalCategories:'personalCategories'
};
const ALL_COLLECTIONS = Object.keys(COLLECTION_STATE_KEYS);

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

const PERSONAL_CATEGORY_COLORS = [
  '#f2a7bd','#e8a5a5','#f6b49a','#f3c27b','#f2dd7d','#c8e27a',
  '#b9d8a6','#a8ddb5','#83d5c7','#7fc6cc','#aed7e8','#8ec9e8',
  '#8bafe0','#9ea6e8','#b6a2e6','#c79ddd','#d99ac7','#d6a8b8',
  '#d9c4a5','#e5b88a','#afc9a7','#a7c4d8','#b2b6d4','#c8b3a5'
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

const FOLDER_COLORS = ['#d9f6c4','#e6f8d9','#d9efe8','#dcebf8','#e7def8','#f2def2','#f8dce7','#fae5cf','#f8efca','#ece6df','#dce5d1','#e9e2f0'];
function renderFolderColorPalette(selected){
  const palette=$('folderColorPalette');
  if(!palette) return;
  const current=selected || $('folderColor').value || FOLDER_COLORS[0];
  $('folderColor').value=current;
  const colors=FOLDER_COLORS.includes(current)?FOLDER_COLORS:[current,...FOLDER_COLORS];
  palette.innerHTML='';
  colors.forEach(color=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='color-swatch'+(color.toLowerCase()===current.toLowerCase()?' selected':'');
    btn.style.setProperty('--swatch',color);
    btn.setAttribute('aria-label',`Выбрать цвет папки ${color}`);
    btn.addEventListener('click',()=>{
      $('folderColor').value=color;
      palette.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('selected'));
      btn.classList.add('selected');
    });
    palette.appendChild(btn);
  });
}
function finiteOrder(v){ return Number.isFinite(Number(v)) ? Number(v) : null; }
function createdSort(a,b){
  const ad=String(a.createdAt||''), bd=String(b.createdAt||'');
  if(ad!==bd) return ad.localeCompare(bd);
  return String(a.name||'').localeCompare(String(b.name||''),'ru',{numeric:true,sensitivity:'base'});
}
function sortByOrder(items, getter=(x)=>x.order){
  return [...items].sort((a,b)=>{
    const ao=finiteOrder(getter(a)), bo=finiteOrder(getter(b));
    if(ao!==null && bo!==null && ao!==bo) return ao-bo;
    if(ao!==null && bo===null) return 1;
    if(ao===null && bo!==null) return -1;
    return createdSort(a,b);
  });
}
function nextOrder(items,getter=(x)=>x.order){
  const vals=items.map(getter).map(finiteOrder).filter(v=>v!==null);
  return (vals.length?Math.max(...vals):items.length*100)+100;
}
function folderOrderValue(item,folderId){ return item?.folderOrders?.[folderId]; }
function folderIdsOf(item){ return Array.isArray(item?.folderIds)?item.folderIds.filter(Boolean):[]; }
function libraryFolderById(kind,id){
  return (kind==='material'?state.materialFolders:state.trainerFolders).find(f=>f.id===id);
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

function scheduleRender(){
  if(renderScheduled) return;
  renderScheduled=true;
  requestAnimationFrame(()=>{
    renderScheduled=false;
    renderAll();
  });
}
function upsertCachedItem(collectionName,item){
  const key=COLLECTION_STATE_KEYS[collectionName];
  if(!key) return;
  const list=state[key];
  const index=list.findIndex(x=>x.id===item.id);
  if(index>=0) list[index]={...list[index],...item};
  else list.push(item);
  loadedCollections.add(collectionName);
}
function removeCachedItem(collectionName,id){
  const key=COLLECTION_STATE_KEYS[collectionName];
  if(!key) return;
  state[key]=state[key].filter(x=>x.id!==id);
}
async function writeCachedDoc(collectionName,item){
  const {id,...data}=item;
  const saved={...item,updatedAt:new Date().toISOString()};
  await setDoc(userDoc(collectionName,id), {...data,updatedAt:saved.updatedAt});
  upsertCachedItem(collectionName,saved);
  scheduleRender();
  return saved;
}
async function deleteCachedDoc(collectionName,id){
  await deleteDoc(userDoc(collectionName,id));
  removeCachedItem(collectionName,id);
  scheduleRender();
}
function dataErrorMessage(error){
  if(error?.code==='permission-denied') return 'Нет доступа к Firestore. Проверь правила доступа. Сохранённые данные не удалены.';
  if(error?.code==='resource-exhausted') return 'Дневной лимит Firestore исчерпан. Данные не удалены — доступ вернётся после сброса квоты.';
  if(error?.code==='unavailable') return 'Firebase временно недоступен. Данные не удалены.';
  if(navigator.onLine===false) return 'Нет соединения с интернетом. Данные в облаке не удалены.';
  return 'Не удалось загрузить данные из облака. Сохранённые данные не удалены.';
}
function setDataStatus(text='',kind='info',showRetry=false){
  const banner=$('dataStatusBanner');
  if(!banner) return;
  if(!text){
    banner.hidden=true;
    banner.className='data-status-banner';
    return;
  }
  banner.hidden=false;
  banner.className=`data-status-banner ${kind}`;
  $('dataStatusText').textContent=text;
  $('retryDataBtn').hidden=!showRetry;
}
async function loadCollectionOnce(name,{force=false}={}){
  if(!currentUser) return;
  if(!force && loadedCollections.has(name)) return state[COLLECTION_STATE_KEYS[name]];
  if(loadingCollections.has(name)) return loadingCollections.get(name);
  const promise=(async()=>{
    const snapshot=await getDocs(userCollection(name));
    const key=COLLECTION_STATE_KEYS[name];
    state[key]=snapshot.docs.map(d=>({id:d.id,...d.data()}));
    loadedCollections.add(name);
    if(name==='lessons') lessonsSyncReady=true;
    if(name==='studentTopics') studentTopicsSyncReady=true;
    maybeMigrateExistingLessonTopics();
    return state[key];
  })();
  loadingCollections.set(name,promise);
  try{
    return await promise;
  }finally{
    loadingCollections.delete(name);
  }
}
async function ensureCollections(names,{force=false,showStatus=true}={}){
  const needed=[...new Set(names)].filter(Boolean);
  if(!needed.length) return;
  if(showStatus) setDataStatus('Загружаю данные…','loading',false);
  try{
    await Promise.all(needed.map(name=>loadCollectionOnce(name,{force})));
    if(showStatus) setDataStatus();
  }catch(error){
    console.error('Firestore load failed',error);
    setDataStatus(dataErrorMessage(error),'error',true);
    throw error;
  }
}
function requiredCollectionsForView(name=currentView){
  if(name==='calendar') return currentCalendarMode==='personal'
    ? ['personalEvents','personalCategories']
    : ['students','lessons'];
  if(name==='students') return ['students','lessons'];
  if(name==='studentDetail') return ['students','lessons','studentTopics'];
  if(name==='materials') return ['materials','materialFolders'];
  if(name==='trainers') return ['trainers','trainerFolders'];
  if(name==='planner') return ['tasks'];
  return [];
}
function renderCurrentView(name=currentView){
  if(name==='calendar') renderCalendar();
  else if(name==='students') renderStudents();
  else if(name==='studentDetail') renderStudentDetail();
  else if(name==='materials') renderMaterials();
  else if(name==='trainers') renderTrainers();
  else if(name==='planner') renderPlanner();
}
function showCalendarLoading(){
  $('paidTotal').textContent='—';
  $('unpaidTotal').textContent='—';
  $('conductedCount').textContent='—';
  $('calendarGrid').innerHTML='<div class="data-placeholder">Загружаю данные календаря…</div>';
}
async function ensureViewData(name=currentView,{force=false,showStatus=true}={}){
  const required=requiredCollectionsForView(name);
  if(name==='calendar' && !required.every(x=>loadedCollections.has(x))) showCalendarLoading();
  try{
    await ensureCollections(required,{force,showStatus});
    renderCurrentView(name);
  }catch(error){
    if(name==='calendar') $('calendarGrid').innerHTML='<div class="data-placeholder error">Не удалось загрузить календарь. Данные в Firebase не удалены.</div>';
  }
}
async function refreshCurrentContext({force=true,showStatus=false}={}){
  if(!currentUser) return;
  const required=requiredCollectionsForView(currentView);
  if(!required.length) return;
  try{
    await ensureCollections(required,{force,showStatus});
    renderCurrentView(currentView);
  }catch(error){
    // Ошибка уже показана через dataStatusBanner.
  }
}
async function persistStudent(student){ return writeCachedDoc('students',student); }
async function persistLesson(lesson){ return writeCachedDoc('lessons',lesson); }
async function persistStudentTopic(topic){ return writeCachedDoc('studentTopics',topic); }
async function persistMaterial(material){ return writeCachedDoc('materials',material); }
async function persistTrainer(trainer){ return writeCachedDoc('trainers',trainer); }
async function persistLibraryFolder(kind,folder){
  const collectionName=kind==='material'?'materialFolders':'trainerFolders';
  return writeCachedDoc(collectionName,folder);
}
async function persistTask(task){ return writeCachedDoc('tasks',task); }
async function persistPersonalEvent(event){ return writeCachedDoc('personalEvents',event); }
async function persistPersonalCategory(category){ return writeCachedDoc('personalCategories',category); }
function getPersonalEvent(id){ return state.personalEvents.find(e=>e.id===id); }
function getPersonalCategory(id){ return state.personalCategories.find(c=>c.id===id); }

function normalizeTopicName(value=''){
  return String(value).trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
}
function hashString(value=''){
  let h=2166136261;
  for(let i=0;i<value.length;i++){
    h^=value.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(36);
}
function autoStudentTopicId(studentId,name){
  return `topic_auto_${hashString(`${studentId}|${normalizeTopicName(name)}`)}`;
}
function getStudentTopic(id){ return state.studentTopics.find(t=>t.id===id); }
function findStudentTopic(studentId,name){
  const key=normalizeTopicName(name);
  return state.studentTopics.find(t=>t.studentId===studentId && normalizeTopicName(t.name)===key);
}
async function syncLessonTopicsToStudentMap(lesson){
  if(!lesson?.conducted || lesson.cancelled || !lesson.studentId) return;
  const seen=new Set();
  const saves=[];
  for(const lessonTopic of (lesson.topics||[])){
    const name=String(lessonTopic.name||'').trim();
    const key=normalizeTopicName(name);
    if(!name || !key || seen.has(key)) continue;
    seen.add(key);
    const existing=findStudentTopic(lesson.studentId,name);
    if(existing?.hidden) continue;
    const next={
      ...(existing||{}),
      id:existing?.id||autoStudentTopicId(lesson.studentId,name),
      studentId:lesson.studentId,
      name:existing?.name||name,
      status:existing?.status==='planned'?'studying':(existing?.status||'studying'),
      order:(existing && (existing.status||'studying')!=='planned') ? (existing.order ?? nextOrder(state.studentTopics.filter(t=>t.studentId===lesson.studentId && !t.hidden && (t.status||'studying')===(existing.status||'studying')))) : (nextOrder(state.studentTopics.filter(t=>t.studentId===lesson.studentId && !t.hidden && (t.status||'studying')==='studying')) + saves.length*100),
      progress:Number(lessonTopic.progress)||existing?.progress||null,
      comment:existing?.comment||'',
      lastLessonDate:lesson.date||existing?.lastLessonDate||'',
      createdAt:existing?.createdAt||new Date().toISOString()
    };
    saves.push(persistStudentTopic(next));
  }
  if(saves.length) await Promise.all(saves);
}
async function maybeMigrateExistingLessonTopics(){
  if(initialTopicMigrationDone || !lessonsSyncReady || !studentTopicsSyncReady || !currentUser) return;
  initialTopicMigrationDone=true;
  const latestByKey=new Map();
  const conducted=[...state.lessons]
    .filter(l=>l.conducted && !l.cancelled && l.studentId)
    .sort((a,b)=>`${a.date||''} ${a.time||''}`.localeCompare(`${b.date||''} ${b.time||''}`));
  conducted.forEach(l=>{
    (l.topics||[]).forEach(t=>{
      const name=String(t.name||'').trim();
      const normalized=normalizeTopicName(name);
      if(!name || !normalized) return;
      latestByKey.set(`${l.studentId}|${normalized}`,{lesson:l,topic:t,name});
    });
  });
  const saves=[];
  latestByKey.forEach(({lesson,topic,name})=>{
    if(findStudentTopic(lesson.studentId,name)) return;
    saves.push(persistStudentTopic({
      id:autoStudentTopicId(lesson.studentId,name),
      studentId:lesson.studentId,
      name,
      status:'studying',
      order:nextOrder(state.studentTopics.filter(t=>t.studentId===lesson.studentId && !t.hidden && (t.status||'studying')==='studying')) + saves.length*100,
      progress:Number(topic.progress)||null,
      comment:'',
      lastLessonDate:lesson.date||'',
      createdAt:new Date().toISOString()
    }));
  });
  if(saves.length){
    try{ await Promise.all(saves); }
    catch(error){ console.error('Topic migration failed',error); }
  }
}

function renderAll(){
  renderCalendar();
  renderStudents();
  renderMaterials();
  renderTrainers();
  renderPlanner();
  if(activeStudentId && getStudent(activeStudentId)) renderStudentDetail();
}

async function startCloudSync(user){
  loadedCollections.clear();
  loadingCollections.clear();
  lessonsSyncReady=false;
  studentTopicsSyncReady=false;
  initialTopicMigrationDone=false;
  lastAutoRefreshAt=Date.now();
  setDataStatus('Загружаю данные…','loading',false);
  showCalendarLoading();
  await ensureViewData('calendar',{force:true,showStatus:true});
}
function stopCloudSync(){
  loadedCollections.clear();
  loadingCollections.clear();
  lessonsSyncReady=false;
  studentTopicsSyncReady=false;
  initialTopicMigrationDone=false;
  setDataStatus();
}
function handleFirestoreError(error){
  console.error(error);
  setDataStatus(dataErrorMessage(error),'error',true);
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
    startCloudSync(user).catch(error=>console.error('Initial data load failed',error));
  }else{
    stopCloudSync();
    state.students=[]; state.lessons=[]; state.studentTopics=[]; state.materials=[]; state.materialFolders=[]; state.trainers=[]; state.trainerFolders=[]; state.tasks=[]; state.personalEvents=[]; state.personalCategories=[]; activeStudentId=null; activeStudentTab='lessons'; activeMaterialFolderId=null; activeTrainerFolderId=null;
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
  currentView=name;
  Object.values(views).filter(Boolean).forEach(v=>v.classList.remove('active-view'));
  target.classList.add('active-view');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  const required=requiredCollectionsForView(name);
  if(required.every(x=>loadedCollections.has(x))) renderCurrentView(name);
  else ensureViewData(name,{showStatus:true});
}

document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
$('backToStudents').addEventListener('click',()=>switchView('students'));

$('prevMonth').addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); });
$('nextMonth').addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); });
$('todayBtn').addEventListener('click',()=>{ currentDate = new Date(); currentDate.setDate(1); renderCalendar(); });
$('studyCalendarMode').addEventListener('click',()=>{
  currentCalendarMode='study';
  ensureViewData('calendar',{showStatus:true});
});
$('personalCalendarMode').addEventListener('click',()=>{
  currentCalendarMode='personal';
  ensureViewData('calendar',{showStatus:true});
});
$('managePersonalCategoriesBtn').addEventListener('click',()=>openPersonalCategoryManager());
$('newPersonalCategoryFromEventBtn').addEventListener('click',()=>openPersonalCategoryManager());
$('addPersonalEventBtn').addEventListener('click',()=>{
  const now=new Date();
  const sameMonth=now.getFullYear()===currentDate.getFullYear() && now.getMonth()===currentDate.getMonth();
  const d=new Date(currentDate.getFullYear(),currentDate.getMonth(),sameMonth?now.getDate():1);
  openPersonalEventModal(null,toISODate(d));
});

function renderCalendar(){
  const title = currentDate.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  $('monthTitle').textContent = title.charAt(0).toUpperCase()+title.slice(1);
  const personal=currentCalendarMode==='personal';
  $('studyCalendarMode').classList.toggle('active',!personal);
  $('personalCalendarMode').classList.toggle('active',personal);
  $('calendarEyebrow').textContent=personal?'Личный календарь':'Планер занятий';
  $('studySummaryGrid').hidden=personal;
  $('personalExpenses').hidden=!personal;
  $('personalCalendarActions').hidden=!personal;

  const key = monthKey(currentDate);
  if(personal) renderPersonalExpenses(key,title);
  else{
    const monthLessons = state.lessons.filter(l=>l.date?.startsWith(key));
    const earned = monthLessons.filter(l=>l.paid && !l.cancelled).reduce((s,l)=>s+Number(l.price||0),0);
    const future = monthLessons.filter(l=>!l.paid && !l.cancelled).reduce((s,l)=>s+Number(l.price||0),0);
    const conducted = monthLessons.filter(l=>l.conducted && !l.cancelled).length;
    $('paidTotal').textContent = money(earned);
    $('unpaidTotal').textContent = money(future);
    $('conductedCount').textContent = conducted;
  }

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
    cell.className='day-cell'+(personal?' personal-day-cell':'');
    if(d.getMonth()!==month) cell.classList.add('outside');
    if(d.getTime()===today.getTime()) cell.classList.add('today');
    const addTitle=personal?'Добавить событие':'Добавить занятие';
    cell.innerHTML=`<div class="day-head"><span class="day-number">${d.getDate()}</span><button class="add-lesson-mini" title="${addTitle}">+</button></div><div class="lessons-list"></div>`;
    cell.querySelector('.add-lesson-mini').addEventListener('click',(e)=>{e.stopPropagation(); personal?openPersonalEventModal(null,iso):openLessonModal(null,iso);});
    cell.addEventListener('dblclick',()=>personal?openPersonalEventModal(null,iso):openLessonModal(null,iso));
    const list = cell.querySelector('.lessons-list');
    if(personal){
      const events=state.personalEvents.filter(e=>e.date===iso).sort(personalEventSort);
      const visible=events.slice(0,5);
      visible.forEach(e=>list.appendChild(renderPersonalEventChip(e)));
      if(events.length>5){
        const more=document.createElement('button');
        more.type='button'; more.className='personal-more-btn'; more.textContent=`+ ещё ${events.length-5}`;
        more.addEventListener('click',(ev)=>{
          ev.stopPropagation(); more.remove();
          events.slice(5).forEach(e=>list.appendChild(renderPersonalEventChip(e)));
        });
        list.appendChild(more);
      }
    }else{
      const lessons = state.lessons.filter(l=>l.date===iso).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
      lessons.forEach(l=>list.appendChild(renderLessonChip(l)));
    }
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
function personalEventSort(a,b){
  if(!!a.allDay!==!!b.allDay) return a.allDay?-1:1;
  return (a.time||'99:99').localeCompare(b.time||'99:99') || String(a.name||'').localeCompare(String(b.name||''),'ru');
}
function renderPersonalEventChip(event){
  const category=getPersonalCategory(event.categoryId);
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='personal-event-chip';
  btn.style.setProperty('--event-color',category?.color||'#e7e1dd');
  const amount=Number(event.expense||0);
  const amountLabel=amount>0?money(amount):'';
  btn.innerHTML=`${amountLabel?`<strong class="personal-event-time">${escapeHtml(amountLabel)}</strong>`:''}<span class="personal-event-name">${escapeHtml(event.name||'Событие')}</span>`;
  const eventTime=event.allDay?'Весь день':(event.time||'');
  btn.title=[event.name,category?.name,eventTime,amountLabel].filter(Boolean).join(' · ');
  btn.addEventListener('click',(e)=>{e.stopPropagation();openPersonalEventModal(event.id);});
  return btn;
}
function renderPersonalExpenses(key,title){
  const events=state.personalEvents.filter(e=>e.date?.startsWith(key));
  const total=events.reduce((sum,e)=>sum+Number(e.expense||0),0);
  $('personalExpensesTotal').textContent=money(total);
  const summary=$('personalExpenses').querySelector('summary span:first-child');
  if(summary) summary.textContent=`Траты за ${title.toLocaleLowerCase('ru-RU')}`;
  const grouped=new Map();
  events.forEach(e=>{
    const amount=Number(e.expense||0); if(!amount) return;
    const cat=getPersonalCategory(e.categoryId);
    const id=cat?.id||'none';
    const row=grouped.get(id)||{name:cat?.name||'Без категории',color:cat?.color||'#d8d1cc',amount:0};
    row.amount+=amount; grouped.set(id,row);
  });
  const box=$('personalExpensesBreakdown'); box.innerHTML='';
  const rows=[...grouped.values()].sort((a,b)=>b.amount-a.amount);
  if(!rows.length){ box.innerHTML='<div class="personal-expenses-empty">В этом месяце траты ещё не добавлены.</div>'; return; }
  rows.forEach(row=>{
    const item=document.createElement('div'); item.className='personal-expense-row';
    item.innerHTML=`<span class="personal-expense-label"><i style="--expense-color:${row.color}"></i>${escapeHtml(row.name)}</span><strong>${money(row.amount)}</strong>`;
    box.appendChild(item);
  });
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
    const conductedLessons=lessons.filter(l=>l.conducted);
    const paid=lessons.filter(l=>l.paid).reduce((sum,l)=>sum+Number(l.price||0),0);
    const progresses=conductedLessons.flatMap(l=>(l.topics||[]).map(t=>Number(t.progress)).filter(Boolean));
    const avg=progresses.length?(progresses.reduce((a,b)=>a+b,0)/progresses.length).toFixed(1):'—';
    const card=document.createElement('button');
    card.className='student-card';
    card.style.setProperty('--student-color',s.color||'#cdb7f6');
    card.innerHTML=`<h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.className||'Класс не указан')} · ${money(s.price)} / занятие</p>
      <div class="student-stats"><div class="student-stat"><strong>${conductedLessons.length}</strong><span>занятий</span></div><div class="student-stat"><strong>${avg}${avg==='—'?'':'/10'}</strong><span>средний прогресс</span></div><div class="student-stat"><strong>${money(paid)}</strong><span>получено</span></div></div>`;
    card.addEventListener('click',()=>openStudentDetail(s.id));
    grid.appendChild(card);
  });
}

function openStudentDetail(id){
  activeStudentId=id;
  activeStudentTab='lessons';
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
  const studentTopics=state.studentTopics.filter(t=>t.studentId===s.id && !t.hidden);
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

    <div class="student-inner-tabs" role="tablist" aria-label="Карточка ученика">
      <button type="button" class="student-inner-tab ${activeStudentTab==='lessons'?'active':''}" data-student-tab="lessons">Занятия</button>
      <button type="button" class="student-inner-tab ${activeStudentTab==='topics'?'active':''}" data-student-tab="topics">Темы <span>${studentTopics.length||''}</span></button>
    </div>

    <div id="studentLessonsPanel" class="student-tab-panel" ${activeStudentTab==='lessons'?'':'hidden'}>
      <div class="journal">
        <div class="journal-head"><div><div class="eyebrow">История занятий</div><h3>Журнал</h3></div><button class="primary-btn" id="addLessonForStudent">+ Занятие</button></div>
        ${lessons.length ? renderJournalTable(lessons) : '<div class="empty-state" style="margin:16px">У этого ученика пока нет занятий.</div>'}
      </div>
    </div>

    <div id="studentTopicsPanel" class="student-tab-panel" ${activeStudentTab==='topics'?'':'hidden'}>
      ${renderStudentTopicMap(s.id)}
    </div>`;
  $('studentDetail').innerHTML=html;
  $('editStudentProfile').addEventListener('click',()=>openStudentModal(s.id));
  $('addLessonForStudent')?.addEventListener('click',()=>openLessonModal(null,toISODate(new Date()),s.id));
  document.querySelectorAll('[data-open-lesson]').forEach(el=>el.addEventListener('click',()=>openLessonModal(el.dataset.openLesson)));
  document.querySelectorAll('[data-student-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    activeStudentTab=btn.dataset.studentTab;
    renderStudentDetail();
  }));
  $('addStudentTopicBtn')?.addEventListener('click',()=>openStudentTopicModal());
  document.querySelectorAll('[data-edit-student-topic]').forEach(btn=>btn.addEventListener('click',()=>openStudentTopicModal(btn.dataset.editStudentTopic)));
  if(activeStudentTab==='topics') bindTopicOrdering(s.id);
}
function topicStatusMeta(status){
  if(status==='review') return {label:'Повторить',group:'Нужно повторить',className:'review'};
  if(status==='planned') return {label:'В планах',group:'В планах',className:'planned'};
  if(status==='studied') return {label:'Изучено',group:'Изучено',className:'studied'};
  return {label:'Изучаем',group:'Изучаем',className:'studying'};
}
function topicMoveButton(topic,direction,disabled){
  const label=direction==='up'?'Выше':'Ниже';
  const symbol=direction==='up'?'↑':'↓';
  return `<button type="button" class="order-step-btn" data-topic-move="${topic.id}" data-direction="${direction}" ${disabled?'disabled':''} aria-label="${label}">${symbol}</button>`;
}
function renderStudentTopicCard(topic,index,total){
  const meta=topicStatusMeta(topic.status);
  const progress=Number(topic.progress)||null;
  return `<article class="student-topic-card ${meta.className} reorder-card" draggable="true" data-topic-id="${topic.id}" data-topic-status="${topic.status||'studying'}">
    <span class="drag-handle" title="Перетащить" aria-hidden="true">⋮⋮</span>
    <button type="button" class="student-topic-edit" data-edit-student-topic="${topic.id}" aria-label="Редактировать тему" title="Редактировать">•••</button>
    <div class="mobile-order-controls">${topicMoveButton(topic,'up',index===0)}${topicMoveButton(topic,'down',index===total-1)}</div>
    <div class="student-topic-card-head">
      <h4>${escapeHtml(topic.name||'Без названия')}</h4>
      <span class="student-topic-status ${meta.className}">${meta.label}</span>
    </div>
    <div class="student-topic-progress">
      <div class="student-topic-progress-label"><span>Освоение</span><strong>${progress?`${progress}/10`:'—'}</strong></div>
      <div class="student-topic-progress-track"><span style="width:${progress?progress*10:0}%"></span></div>
    </div>
    <div class="student-topic-comment">
      <span>Проблема / комментарий</span>
      <p class="${topic.comment?'':'muted-empty'}">${escapeHtml(topic.comment||'Не заполнено')}</p>
    </div>
    ${topic.lastLessonDate?`<div class="student-topic-date">Последнее занятие по теме: ${escapeHtml(formatDateRu(topic.lastLessonDate,false))}</div>`:''}
  </article>`;
}
async function persistTopicOrder(studentId,status,orderedIds){
  const saves=orderedIds.map((id,index)=>{
    const topic=getStudentTopic(id);
    return topic?persistStudentTopic({...topic,order:(index+1)*100}):Promise.resolve();
  });
  await Promise.all(saves);
}
function bindTopicOrdering(studentId){
  document.querySelectorAll('.student-topic-grid[data-topic-status]').forEach(grid=>{
    const status=grid.dataset.topicStatus;
    let dragged=null;
    grid.querySelectorAll('.student-topic-card').forEach(card=>{
      card.addEventListener('dragstart',e=>{
        dragged=card;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',card.dataset.topicId);
      });
      card.addEventListener('dragend',()=>{ card.classList.remove('is-dragging'); dragged=null; });
      card.addEventListener('dragover',e=>{
        if(!dragged || dragged===card) return;
        e.preventDefault();
        const rect=card.getBoundingClientRect();
        const before=(e.clientY<rect.top+rect.height/2) || (Math.abs(e.clientY-(rect.top+rect.height/2))<rect.height*.2 && e.clientX<rect.left+rect.width/2);
        grid.insertBefore(dragged,before?card:card.nextSibling);
      });
    });
    grid.addEventListener('drop',async e=>{
      if(!dragged) return;
      e.preventDefault();
      const ids=[...grid.querySelectorAll('.student-topic-card')].map(el=>el.dataset.topicId);
      try{ await persistTopicOrder(studentId,status,ids); toast('Порядок тем сохранён'); }
      catch(error){ console.error(error); toast('Не удалось сохранить порядок'); renderStudentDetail(); }
    });
  });
  document.querySelectorAll('[data-topic-move]').forEach(btn=>btn.addEventListener('click',async()=>{
    const topic=getStudentTopic(btn.dataset.topicMove); if(!topic) return;
    const status=topic.status||'studying';
    const list=sortByOrder(state.studentTopics.filter(t=>t.studentId===studentId && !t.hidden && (t.status||'studying')===status));
    const idx=list.findIndex(t=>t.id===topic.id), next=btn.dataset.direction==='up'?idx-1:idx+1;
    if(idx<0 || next<0 || next>=list.length) return;
    [list[idx],list[next]]=[list[next],list[idx]];
    try{ await persistTopicOrder(studentId,status,list.map(t=>t.id)); }
    catch(error){ console.error(error); toast('Не удалось сохранить порядок'); }
  }));
}
function renderStudentTopicMap(studentId){
  const all=state.studentTopics.filter(t=>t.studentId===studentId && !t.hidden);
  const groups=[
    {status:'review',title:'Нужно повторить',hint:'Темы, к которым стоит вернуться.'},
    {status:'studying',title:'Изучаем',hint:'Темы, которые сейчас в работе.'},
    {status:'planned',title:'В планах',hint:'Будущие темы.'},
    {status:'studied',title:'Изучено',hint:'Темы, которые уже прошли.'}
  ];
  const body=groups.map(g=>{
    const topics=sortByOrder(all.filter(t=>(t.status||'studying')===g.status));
    if(!topics.length) return '';
    return `<section class="student-topic-group">
      <div class="student-topic-group-head">
        <div><h3>${g.title}</h3><p>${g.hint}</p></div>
        <span>${topics.length}</span>
      </div>
      <div class="student-topic-grid" data-topic-status="${g.status}">${topics.map((t,i)=>renderStudentTopicCard(t,i,topics.length)).join('')}</div>
    </section>`;
  }).join('');
  return `<div class="student-topics-wrap">
    <div class="student-topics-head">
      <div>
        <div class="eyebrow">Учебная карта</div>
        <h3>Темы ученика</h3>
        <p>Что уже проходили, что изучаете сейчас и что запланировано дальше.</p>
      </div>
      <button type="button" class="primary-btn" id="addStudentTopicBtn">+ Добавить тему</button>
    </div>
    ${all.length?body:'<div class="empty-state student-topics-empty"><strong>Карта тем пока пустая</strong><br><span>Добавь будущую тему вручную или отметь занятие как проведённое — темы из урока появятся здесь автоматически.</span></div>'}
  </div>`;
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
function normalizeSearch(value=''){ return String(value).trim().toLocaleLowerCase('ru-RU'); }
function populateMaterialClassFilter(){
  const select=$('materialClassFilter'); if(!select) return;
  const previous=select.value || 'all';
  const classes=[...new Set(state.materials.map(m=>(m.className||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true,sensitivity:'base'}));
  select.innerHTML='<option value="all">Все</option>'+classes.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  select.value=classes.includes(previous)?previous:'all';
}
function populateTrainerClassFilter(){
  const select=$('trainerClassFilter'); if(!select) return;
  const previous=select.value || 'all';
  const classes=[...new Set(state.trainers.map(t=>(t.className||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true,sensitivity:'base'}));
  select.innerHTML='<option value="all">Все</option>'+classes.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  select.value=classes.includes(previous)?previous:'all';
}
function libraryConfig(kind){
  return kind==='material' ? {
    items:state.materials, folders:state.materialFolders, active:activeMaterialFolderId,
    grid:$('materialsGrid'), folderSection:$('materialFoldersSection'), context:$('materialFolderContext'),
    search:$('materialSearch'), classFilter:$('materialClassFilter'), levelFilter:$('materialLevelFilter'), count:$('materialsCount')
  } : {
    items:state.trainers, folders:state.trainerFolders, active:activeTrainerFolderId,
    grid:$('trainersGrid'), folderSection:$('trainerFoldersSection'), context:$('trainerFolderContext'),
    search:$('trainerSearch'), classFilter:$('trainerClassFilter'), levelFilter:null, count:$('trainersCount')
  };
}
function isLibraryFiltered(kind){
  const c=libraryConfig(kind);
  return !!normalizeSearch(c.search?.value||'') || (c.classFilter?.value||'all')!=='all' || (c.levelFilter?.value||'all')!=='all';
}
function setActiveLibraryFolder(kind,id){
  if(kind==='material') activeMaterialFolderId=id||null; else activeTrainerFolderId=id||null;
  kind==='material'?renderMaterials():renderTrainers();
}
function folderItemCount(kind,folderId){ return libraryConfig(kind).items.filter(i=>folderIdsOf(i).includes(folderId)).length; }
function renderFolderChoices(kind,selectedIds=[]){
  const host=$(kind==='material'?'materialFolderChoices':'trainerFolderChoices');
  if(!host) return;
  const folders=sortByOrder(libraryConfig(kind).folders);
  if(!folders.length){ host.innerHTML='<span class="folder-choice-empty">Папок пока нет — можно сохранить без папки.</span>'; return; }
  const selected=new Set(selectedIds||[]);
  host.innerHTML=folders.map(f=>`<label class="folder-choice-chip" style="--folder-color:${escapeAttr(f.color||'#e6f8d9')}"><input type="checkbox" value="${f.id}" ${selected.has(f.id)?'checked':''}><span>${escapeHtml(f.name)}</span></label>`).join('');
}
function getFolderChoiceIds(kind){
  const host=$(kind==='material'?'materialFolderChoices':'trainerFolderChoices');
  return host?[...host.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value):[];
}
function folderNamesForItem(kind,item){
  return folderIdsOf(item).map(id=>libraryFolderById(kind,id)?.name).filter(Boolean);
}
function folderOrderForNewMembership(kind,item,folderId){
  const members=libraryConfig(kind).items.filter(x=>folderIdsOf(x).includes(folderId) && x.id!==item?.id);
  return nextOrder(members,x=>folderOrderValue(x,folderId));
}
function withFolderMembership(kind,existing,folderIds){
  const previous=new Set(folderIdsOf(existing));
  const orders={...(existing?.folderOrders||{})};
  folderIds.forEach(folderId=>{ if(!previous.has(folderId) || finiteOrder(orders[folderId])===null) orders[folderId]=folderOrderForNewMembership(kind,existing,folderId); });
  Object.keys(orders).forEach(id=>{ if(!folderIds.includes(id)) delete orders[id]; });
  return {folderIds,folderOrders:orders};
}
function renderFolderCard(kind,folder,index,total){
  const card=document.createElement('article');
  card.className='library-folder-card reorder-card';
  card.draggable=true; card.dataset.folderId=folder.id;
  card.style.setProperty('--folder-color',folder.color||'#e6f8d9');
  card.innerHTML=`<span class="drag-handle" aria-hidden="true">⋮⋮</span>
    <button type="button" class="folder-edit-btn" data-edit-folder="${folder.id}" aria-label="Редактировать папку">•••</button>
    <div class="mobile-order-controls"><button type="button" class="order-step-btn" data-folder-move="${folder.id}" data-direction="up" ${index===0?'disabled':''}>↑</button><button type="button" class="order-step-btn" data-folder-move="${folder.id}" data-direction="down" ${index===total-1?'disabled':''}>↓</button></div>
    <button type="button" class="folder-open-area" data-open-folder="${folder.id}"><span class="folder-icon">⌁</span><strong>${escapeHtml(folder.name)}</strong><small>${folderItemCount(kind,folder.id)} ${kind==='material'?'материалов':'тренажёров'}</small></button>`;
  card.querySelector('[data-open-folder]').addEventListener('click',()=>setActiveLibraryFolder(kind,folder.id));
  card.querySelector('[data-edit-folder]').addEventListener('click',()=>openFolderModal(kind,folder.id));
  card.addEventListener('dragover',e=>{ e.preventDefault(); card.classList.add('folder-drop-target'); });
  card.addEventListener('dragleave',()=>card.classList.remove('folder-drop-target'));
  card.addEventListener('drop',async e=>{
    card.classList.remove('folder-drop-target');
    const itemId=e.dataTransfer.getData(`application/x-molemix-${kind}`);
    if(!itemId) return;
    e.preventDefault(); e.stopPropagation();
    const item=libraryConfig(kind).items.find(x=>x.id===itemId); if(!item) return;
    if(folderIdsOf(item).includes(folder.id)) return toast('Этот объект уже есть в папке');
    const folderIds=[...folderIdsOf(item),folder.id];
    const next={...item,...withFolderMembership(kind,item,folderIds)};
    try{ kind==='material'?await persistMaterial(next):await persistTrainer(next); toast('Добавлено в папку'); }
    catch(error){ console.error(error); toast('Не удалось добавить в папку'); }
  });
  return card;
}
async function persistFolderOrder(kind,ids){
  await Promise.all(ids.map((id,i)=>{ const f=libraryFolderById(kind,id); return f?persistLibraryFolder(kind,{...f,order:(i+1)*100}):Promise.resolve(); }));
}
function bindFolderOrdering(kind,container){
  let dragged=null;
  container.querySelectorAll('.library-folder-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{ if(e.dataTransfer.types.includes(`application/x-molemix-${kind}`)) return; dragged=card; card.classList.add('is-dragging'); e.dataTransfer.setData('text/plain',card.dataset.folderId); });
    card.addEventListener('dragend',()=>{card.classList.remove('is-dragging');dragged=null;});
    card.addEventListener('dragover',e=>{ if(!dragged || dragged===card) return; e.preventDefault(); const r=card.getBoundingClientRect(); container.insertBefore(dragged,e.clientX<r.left+r.width/2?card:card.nextSibling); });
  });
  container.addEventListener('drop',async e=>{
    if(!dragged) return; e.preventDefault();
    const ids=[...container.querySelectorAll('.library-folder-card')].map(x=>x.dataset.folderId);
    try{ await persistFolderOrder(kind,ids); toast('Порядок папок сохранён'); }catch(error){console.error(error);toast('Не удалось сохранить порядок');}
  });
  container.querySelectorAll('[data-folder-move]').forEach(btn=>btn.addEventListener('click',async e=>{
    e.stopPropagation(); const folders=sortByOrder(libraryConfig(kind).folders), idx=folders.findIndex(f=>f.id===btn.dataset.folderMove), ni=btn.dataset.direction==='up'?idx-1:idx+1;
    if(idx<0||ni<0||ni>=folders.length)return; [folders[idx],folders[ni]]=[folders[ni],folders[idx]];
    try{await persistFolderOrder(kind,folders.map(f=>f.id));}catch(error){console.error(error);toast('Не удалось сохранить порядок');}
  }));
}
function itemOrderGetter(kind,folderId){ return folderId?(item=>folderOrderValue(item,folderId)):(item=>item.order); }
async function persistItemOrder(kind,folderId,ids){
  const items=libraryConfig(kind).items;
  await Promise.all(ids.map((id,i)=>{
    const item=items.find(x=>x.id===id); if(!item) return Promise.resolve();
    const next=folderId?{...item,folderOrders:{...(item.folderOrders||{}),[folderId]:(i+1)*100}}:{...item,order:(i+1)*100};
    return kind==='material'?persistMaterial(next):persistTrainer(next);
  }));
}
function bindItemOrdering(kind,container,folderId,enabled){
  if(!enabled) return;
  let dragged=null;
  container.querySelectorAll('.library-item-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{ dragged=card; card.classList.add('is-dragging'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData(`application/x-molemix-${kind}`,card.dataset.itemId); e.dataTransfer.setData('text/plain',card.dataset.itemId); });
    card.addEventListener('dragend',()=>{card.classList.remove('is-dragging');dragged=null;});
    card.addEventListener('dragover',e=>{ if(!dragged||dragged===card)return; e.preventDefault(); const r=card.getBoundingClientRect(); const before=(e.clientY<r.top+r.height/2)||(Math.abs(e.clientY-(r.top+r.height/2))<r.height*.2&&e.clientX<r.left+r.width/2); container.insertBefore(dragged,before?card:card.nextSibling); });
  });
  container.addEventListener('drop',async e=>{ if(!dragged)return; e.preventDefault(); const ids=[...container.querySelectorAll('.library-item-card')].map(x=>x.dataset.itemId); try{await persistItemOrder(kind,folderId,ids);toast('Порядок сохранён');}catch(error){console.error(error);toast('Не удалось сохранить порядок');} });
  container.querySelectorAll('[data-item-move]').forEach(btn=>btn.addEventListener('click',async()=>{
    const config=libraryConfig(kind), getter=itemOrderGetter(kind,folderId);
    let list=config.items.filter(item=>folderId?folderIdsOf(item).includes(folderId):folderIdsOf(item).length===0);
    list=sortByOrder(list,getter); const idx=list.findIndex(x=>x.id===btn.dataset.itemMove), ni=btn.dataset.direction==='up'?idx-1:idx+1;
    if(idx<0||ni<0||ni>=list.length)return; [list[idx],list[ni]]=[list[ni],list[idx]];
    try{await persistItemOrder(kind,folderId,list.map(x=>x.id));}catch(error){console.error(error);toast('Не удалось сохранить порядок');}
  }));
}
function renderLibraryItemCard(kind,item,index,total,folderId,showFolderNames=false,reorderEnabled=true){
  const isMaterial=kind==='material', url=safeHttpUrl(item.link), meta=isMaterial?materialLevelMeta(item.level):null;
  const card=document.createElement('article');
  card.className=(isMaterial?'material-card':'trainer-card')+' library-item-card reorder-card';
  card.draggable=!!reorderEnabled; card.dataset.itemId=item.id;
  const folders=showFolderNames?folderNamesForItem(kind,item):[];
  card.innerHTML=`${reorderEnabled?'<span class="drag-handle" aria-hidden="true">⋮⋮</span>':''}
    ${reorderEnabled?`<div class="mobile-order-controls"><button type="button" class="order-step-btn" data-item-move="${item.id}" data-direction="up" ${index===0?'disabled':''}>↑</button><button type="button" class="order-step-btn" data-item-move="${item.id}" data-direction="down" ${index===total-1?'disabled':''}>↓</button></div>`:''}
    <div class="${isMaterial?'material':'trainer'}-card-top"><div class="${isMaterial?'material':'trainer'}-title-wrap"><h3>${escapeHtml(item.name||'Без названия')}</h3><div class="${isMaterial?'material':'trainer'}-tags">${item.className?`<span class="${isMaterial?'material':'trainer'}-tag class-tag">${escapeHtml(item.className)}</span>`:''}${isMaterial?`<span class="material-tag level-tag ${meta.className}">${meta.label}</span>`:''}</div></div><button type="button" class="${isMaterial?'material':'trainer'}-edit-btn" data-edit-item="${item.id}" aria-label="Редактировать">•••</button></div>
    ${folders.length?`<div class="item-folder-note">В папках: ${folders.map(escapeHtml).join(', ')}</div>`:''}
    ${isMaterial?`<p class="material-comment ${item.comment?'':'muted-empty'}">${escapeHtml(item.comment||'Комментарий не добавлен')}</p>`:''}
    <div class="${isMaterial?'material':'trainer'}-card-actions">${url?`<a class="${isMaterial?'material':'trainer'}-open-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${isMaterial?'Открыть PDF ↗':'Открыть тренажёр ↗'}</a>`:`<span class="${isMaterial?'material':'trainer'}-no-link">Ссылка не добавлена</span>`}<button type="button" class="ghost-btn ${isMaterial?'material':'trainer'}-edit-text" data-edit-item="${item.id}">Редактировать</button></div>`;
  card.querySelectorAll('[data-edit-item]').forEach(btn=>btn.addEventListener('click',()=>isMaterial?openMaterialModal(item.id):openTrainerModal(item.id)));
  return card;
}
function renderLibrary(kind){
  const c=libraryConfig(kind); if(!c.grid) return;
  kind==='material'?populateMaterialClassFilter():populateTrainerClassFilter();
  const query=normalizeSearch(c.search?.value||''), classFilter=c.classFilter?.value||'all', levelFilter=c.levelFilter?.value||'all', filtered=!!query||classFilter!=='all'||levelFilter!=='all';
  const activeFolder=libraryFolderById(kind,c.active);
  if(c.active && !activeFolder) setActiveLibraryFolder(kind,null);
  const allMatching=c.items.filter(item=>(!query||normalizeSearch(item.name).includes(query))&&(classFilter==='all'||(item.className||'')===classFilter)&&(levelFilter==='all'||!c.levelFilter||(item.level||'medium')===levelFilter));
  c.context.hidden=!activeFolder || filtered;
  if(activeFolder && !filtered){ c.context.innerHTML=`<button type="button" class="back-btn folder-back-btn">← Все папки</button><div class="folder-context-title" style="--folder-color:${escapeAttr(activeFolder.color||'#e6f8d9')}"><span></span><div><strong>${escapeHtml(activeFolder.name)}</strong><small>${folderItemCount(kind,activeFolder.id)} ${kind==='material'?'материалов':'тренажёров'}</small></div></div>`; c.context.querySelector('.folder-back-btn').addEventListener('click',()=>setActiveLibraryFolder(kind,null)); }
  c.folderSection.innerHTML='';
  if(!filtered && !activeFolder){
    const folders=sortByOrder(c.folders); if(folders.length){ const title=document.createElement('div'); title.className='library-subheading'; title.innerHTML='<strong>Папки</strong><span>Можно перетаскивать в своём порядке</span>'; c.folderSection.appendChild(title); const grid=document.createElement('div'); grid.className='library-folders-grid'; folders.forEach((f,i)=>grid.appendChild(renderFolderCard(kind,f,i,folders.length))); c.folderSection.appendChild(grid); bindFolderOrdering(kind,grid); }
  }
  let items;
  if(filtered) items=allMatching;
  else if(activeFolder) items=c.items.filter(item=>folderIdsOf(item).includes(activeFolder.id));
  else items=c.items.filter(item=>folderIdsOf(item).length===0);
  const getter=itemOrderGetter(kind,activeFolder?.id||null);
  items=sortByOrder(items,getter);
  if(c.count){ const total=c.items.length; c.count.textContent=total?(filtered?`Найдено: ${items.length} из ${total}`:(activeFolder?`${items.length} в папке «${activeFolder.name}»`:`Без папки: ${items.length} · Всего: ${total}`)):''; }
  c.grid.innerHTML='';
  if(!c.items.length){ c.grid.innerHTML=`<div class="empty-state ${kind==='material'?'materials':'trainers'}-empty"><strong>${kind==='material'?'Библиотека пока пустая':'Тренажёров пока нет'}</strong><br><span>${kind==='material'?'Добавь первый конспект или PDF.':'Добавь первый тренажёр — его ссылка всегда будет под рукой.'}</span></div>`; return; }
  if(!items.length){ c.grid.innerHTML=`<div class="empty-state ${kind==='material'?'materials':'trainers'}-empty"><strong>${filtered?'Ничего не найдено':activeFolder?'В этой папке пока пусто':'Все записи разложены по папкам'}</strong><br><span>${filtered?'Попробуй изменить поиск или сбросить фильтры.':activeFolder?'Добавь записи через «Редактировать» → Папки.':'Создай новую запись без папки или открой нужную папку.'}</span></div>`; return; }
  items.forEach((item,i)=>c.grid.appendChild(renderLibraryItemCard(kind,item,i,items.length,activeFolder?.id||null,filtered,!filtered)));
  bindItemOrdering(kind,c.grid,activeFolder?.id||null,!filtered);
}
function renderMaterials(){ renderLibrary('material'); }
function renderTrainers(){ renderLibrary('trainer'); }

$('materialSearch').addEventListener('input',()=>{ activeMaterialFolderId=null; renderMaterials(); });
$('materialClassFilter').addEventListener('change',()=>{ activeMaterialFolderId=null; renderMaterials(); });
$('materialLevelFilter').addEventListener('change',()=>{ activeMaterialFolderId=null; renderMaterials(); });
$('clearMaterialFilters').addEventListener('click',()=>{ activeMaterialFolderId=null; $('materialSearch').value=''; $('materialClassFilter').value='all'; $('materialLevelFilter').value='all'; renderMaterials(); });
$('trainerSearch').addEventListener('input',()=>{ activeTrainerFolderId=null; renderTrainers(); });
$('trainerClassFilter').addEventListener('change',()=>{ activeTrainerFolderId=null; renderTrainers(); });
$('clearTrainerFilters').addEventListener('click',()=>{ activeTrainerFolderId=null; $('trainerSearch').value=''; $('trainerClassFilter').value='all'; renderTrainers(); });
$('addMaterialBtn').addEventListener('click',()=>openMaterialModal());
$('addTrainerBtn').addEventListener('click',()=>openTrainerModal());
$('addMaterialFolderBtn').addEventListener('click',()=>openFolderModal('material'));
$('addTrainerFolderBtn').addEventListener('click',()=>openFolderModal('trainer'));
function openMaterialModal(id=null){
  const m=id?state.materials.find(x=>x.id===id):null;
  $('materialModalTitle').textContent=m?'Редактировать материал':'Новый материал'; $('materialId').value=m?.id||''; $('materialName').value=m?.name||''; $('materialClass').value=m?.className||''; $('materialLevel').value=m?.level||'medium'; $('materialLink').value=m?.link||''; $('materialComment').value=m?.comment||''; renderFolderChoices('material',folderIdsOf(m)); $('deleteMaterialBtn').classList.toggle('hidden',!m); $('materialModalBackdrop').hidden=false; setTimeout(()=>$('materialName').focus(),0);
}
$('materialForm').addEventListener('submit',async e=>{
  e.preventDefault(); const id=$('materialId').value||uid('material'), existing=state.materials.find(x=>x.id===id), link=$('materialLink').value.trim(); if(link&&!safeHttpUrl(link))return toast('Ссылка должна начинаться с http:// или https://');
  const membership=withFolderMembership('material',existing,getFolderChoiceIds('material'));
  const material={...(existing||{}),id,name:$('materialName').value.trim(),className:$('materialClass').value.trim(),level:$('materialLevel').value,link,comment:$('materialComment').value.trim(),...membership,order:existing?.order??nextOrder(state.materials.filter(x=>folderIdsOf(x).length===0)),createdAt:existing?.createdAt||new Date().toISOString()}; if(!material.name)return toast('Напиши название материала');
  try{await persistMaterial(material);closeModal('material');toast(existing?'Материал обновлён':'Материал добавлен в библиотеку');}catch(error){console.error(error);toast('Не удалось сохранить материал');}
});
$('deleteMaterialBtn').addEventListener('click',async()=>{ const id=$('materialId').value,m=state.materials.find(x=>x.id===id); if(!id||!m)return; if(confirm(`Удалить материал «${m.name}» из библиотеки? Сам PDF по ссылке удалён не будет.`)){try{await deleteCachedDoc('materials',id);closeModal('material');toast('Материал удалён из библиотеки');}catch(error){console.error(error);toast('Не удалось удалить материал');}} });
function openTrainerModal(id=null){
  const t=id?state.trainers.find(x=>x.id===id):null; $('trainerModalTitle').textContent=t?'Редактировать тренажёр':'Новый тренажёр'; $('trainerId').value=t?.id||''; $('trainerName').value=t?.name||''; $('trainerClass').value=t?.className||''; $('trainerLink').value=t?.link||''; renderFolderChoices('trainer',folderIdsOf(t)); $('deleteTrainerBtn').classList.toggle('hidden',!t); $('trainerModalBackdrop').hidden=false; setTimeout(()=>$('trainerName').focus(),0);
}
$('trainerForm').addEventListener('submit',async e=>{
  e.preventDefault(); const id=$('trainerId').value||uid('trainer'),existing=state.trainers.find(x=>x.id===id),link=$('trainerLink').value.trim(); if(!safeHttpUrl(link))return toast('Вставь корректную ссылку http:// или https://'); const membership=withFolderMembership('trainer',existing,getFolderChoiceIds('trainer'));
  const trainer={...(existing||{}),id,name:$('trainerName').value.trim(),className:$('trainerClass').value.trim(),link,...membership,order:existing?.order??nextOrder(state.trainers.filter(x=>folderIdsOf(x).length===0)),createdAt:existing?.createdAt||new Date().toISOString()}; if(!trainer.name)return toast('Напиши название тренажёра'); if(!trainer.className)return toast('Укажи класс'); try{await persistTrainer(trainer);closeModal('trainer');toast(existing?'Тренажёр обновлён':'Тренажёр добавлен');}catch(error){console.error(error);toast('Не удалось сохранить тренажёр');}
});
$('deleteTrainerBtn').addEventListener('click',async()=>{ const id=$('trainerId').value,t=state.trainers.find(x=>x.id===id); if(!id||!t)return; if(confirm(`Удалить тренажёр «${t.name}» из списка? Сам сайт удалён не будет.`)){try{await deleteCachedDoc('trainers',id);closeModal('trainer');toast('Тренажёр удалён из списка');}catch(error){console.error(error);toast('Не удалось удалить тренажёр');}} });
function openFolderModal(kind,id=null){
  const folder=id?libraryFolderById(kind,id):null; $('folderKind').value=kind; $('folderId').value=folder?.id||''; $('folderModalTitle').textContent=folder?'Редактировать папку':'Новая папка'; $('folderName').value=folder?.name||''; $('folderColor').value=folder?.color||FOLDER_COLORS[0]; renderFolderColorPalette($('folderColor').value); $('deleteFolderBtn').classList.toggle('hidden',!folder); $('folderModalBackdrop').hidden=false; setTimeout(()=>$('folderName').focus(),0);
}
$('folderForm').addEventListener('submit',async e=>{
  e.preventDefault(); const kind=$('folderKind').value,id=$('folderId').value||uid(`${kind}Folder`),existing=libraryFolderById(kind,id),folders=libraryConfig(kind).folders; const folder={...(existing||{}),id,name:$('folderName').value.trim(),color:$('folderColor').value,order:existing?.order??nextOrder(folders),createdAt:existing?.createdAt||new Date().toISOString()}; if(!folder.name)return toast('Напиши название папки'); try{await persistLibraryFolder(kind,folder);closeModal('folder');toast(existing?'Папка обновлена':'Папка создана');}catch(error){console.error(error);toast('Не удалось сохранить папку');}
});
$('deleteFolderBtn').addEventListener('click',async()=>{
  const kind=$('folderKind').value,id=$('folderId').value,folder=libraryFolderById(kind,id); if(!folder)return; if(!confirm(`Удалить папку «${folder.name}»? ${kind==='material'?'Материалы':'Тренажёры'} внутри останутся в библиотеке.`))return;
  const config=libraryConfig(kind), affected=config.items.filter(item=>folderIdsOf(item).includes(id));
  try{await Promise.all(affected.map(item=>{const folderIds=folderIdsOf(item).filter(x=>x!==id),folderOrders={...(item.folderOrders||{})};delete folderOrders[id];const next={...item,folderIds,folderOrders};return kind==='material'?persistMaterial(next):persistTrainer(next);})); await deleteCachedDoc(kind==='material'?'materialFolders':'trainerFolders',id); if(kind==='material')activeMaterialFolderId=null;else activeTrainerFolderId=null;closeModal('folder');toast('Папка удалена, записи сохранены');}catch(error){console.error(error);toast('Не удалось удалить папку');}
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
    try{await deleteCachedDoc('tasks',id);closeModal('task');toast('Задача удалена');}
    catch(error){console.error(error);toast('Не удалось удалить задачу');}
  }
});
$('clearCompletedTasks').addEventListener('click',async()=>{
  const done=state.tasks.filter(t=>t.completed); if(!done.length)return;
  if(!confirm(`Удалить выполненные задачи (${done.length})?`))return;
  try{
    await Promise.all(done.map(t=>deleteCachedDoc('tasks',t.id)));
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


function openStudentTopicModal(id=null){
  const topic=id?getStudentTopic(id):null;
  if(!activeStudentId) return;
  $('studentTopicModalTitle').textContent=topic?'Редактировать тему':'Новая тема';
  $('studentTopicId').value=topic?.id||'';
  $('studentTopicName').value=topic?.name||'';
  $('studentTopicStatus').value=topic?.status||'planned';
  $('studentTopicProgress').value=topic?.progress||'';
  $('studentTopicComment').value=topic?.comment||'';
  $('deleteStudentTopicBtn').classList.toggle('hidden',!topic);
  $('studentTopicModalBackdrop').hidden=false;
  setTimeout(()=>$('studentTopicName').focus(),0);
}
$('studentTopicForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  if(!activeStudentId) return toast('Сначала открой ученика');
  let id=$('studentTopicId').value||uid('topic');
  let existing=getStudentTopic(id);
  const name=$('studentTopicName').value.trim();
  if(!name) return toast('Напиши название темы');
  const duplicate=state.studentTopics.find(t=>t.studentId===activeStudentId && t.id!==id && normalizeTopicName(t.name)===normalizeTopicName(name));
  if(duplicate && !duplicate.hidden) return toast('Такая тема уже есть в карте ученика');
  if(duplicate?.hidden && !existing){ id=duplicate.id; existing=duplicate; }
  const targetStatus=$('studentTopicStatus').value;
  const topic={
    ...(existing||{}),
    id,
    studentId:activeStudentId,
    name,
    status:targetStatus,
    order:(!existing || (existing.status||'studying')!==targetStatus) ? nextOrder(state.studentTopics.filter(t=>t.studentId===activeStudentId && !t.hidden && (t.status||'studying')===targetStatus)) : (existing.order ?? nextOrder(state.studentTopics.filter(t=>t.studentId===activeStudentId && !t.hidden && (t.status||'studying')===targetStatus))),
    progress:Number($('studentTopicProgress').value)||null,
    comment:$('studentTopicComment').value.trim(),
    hidden:false,
    lastLessonDate:existing?.lastLessonDate||'',
    createdAt:existing?.createdAt||new Date().toISOString()
  };
  try{
    await persistStudentTopic(topic);
    closeModal('studentTopic');
    activeStudentTab='topics';
    toast(existing?'Тема обновлена':'Тема добавлена');
  }catch(error){console.error(error);toast('Не удалось сохранить тему');}
});
$('deleteStudentTopicBtn').addEventListener('click',async()=>{
  const id=$('studentTopicId').value;
  const topic=getStudentTopic(id);
  if(!id||!topic)return;
  if(confirm(`Убрать тему «${topic.name}» из учебной карты? История занятий останется.`)){
    try{
      await persistStudentTopic({...topic,hidden:true});
      closeModal('studentTopic');
      activeStudentTab='topics';
      toast('Тема убрана из карты');
    }catch(error){console.error(error);toast('Не удалось убрать тему');}
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
function renderPersonalCategoryPalette(selected){
  const palette=$('personalCategoryColorPalette'); if(!palette) return;
  const current=selected||$('personalCategoryColor').value||PERSONAL_CATEGORY_COLORS[0];
  $('personalCategoryColor').value=current; palette.innerHTML='';
  const colors=PERSONAL_CATEGORY_COLORS.includes(current)?PERSONAL_CATEGORY_COLORS:[current,...PERSONAL_CATEGORY_COLORS];
  colors.forEach(color=>{
    const btn=document.createElement('button'); btn.type='button';
    btn.className='color-swatch'+(color.toLowerCase()===current.toLowerCase()?' selected':'');
    btn.style.setProperty('--swatch',color); btn.setAttribute('aria-label',`Выбрать цвет ${color}`);
    btn.addEventListener('click',()=>{
      $('personalCategoryColor').value=color;
      palette.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('selected'));
      btn.classList.add('selected');
    });
    palette.appendChild(btn);
  });
}
function populatePersonalCategorySelect(selectedId=''){
  const select=$('personalEventCategory');
  const categories=[...state.personalCategories].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'));
  select.innerHTML='<option value="">Без категории</option>'+categories.map(c=>`<option value="${escapeAttr(c.id)}">${escapeHtml(c.name||'Категория')}</option>`).join('');
  select.value=selectedId||'';
}
function openPersonalEventModal(id=null,date=null){
  const event=id?getPersonalEvent(id):null;
  $('personalEventModalTitle').textContent=event?'Редактировать событие':'Новое событие';
  $('personalEventId').value=event?.id||'';
  $('personalEventName').value=event?.name||'';
  $('personalEventDate').value=event?.date||date||toISODate(new Date());
  $('personalEventTime').value=event?.time||'18:00';
  $('personalEventAllDay').checked=!!event?.allDay;
  $('personalEventTime').disabled=!!event?.allDay;
  populatePersonalCategorySelect(event?.categoryId||'');
  $('personalEventComment').value=event?.comment||'';
  $('personalEventLink').value=event?.link||'';
  $('personalEventExpense').value=event?.expense?String(event.expense):'';
  const openLink=$('personalEventOpenLink');
  const url=safeHttpUrl(event?.link||''); openLink.hidden=!url; openLink.href=url||'#';
  $('deletePersonalEventBtn').classList.toggle('hidden',!event);
  $('duplicatePersonalEventBtn').classList.toggle('hidden',!event);
  $('personalEventModalBackdrop').hidden=false;
}
$('personalEventAllDay').addEventListener('change',()=>{
  $('personalEventTime').disabled=$('personalEventAllDay').checked;
});
$('personalEventLink').addEventListener('input',()=>{
  const url=safeHttpUrl($('personalEventLink').value.trim());
  $('personalEventOpenLink').hidden=!url; $('personalEventOpenLink').href=url||'#';
});
$('personalEventForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const existingId=$('personalEventId').value;
  const id=existingId||uid('personal_event');
  const existing=getPersonalEvent(id);
  const event={
    ...(existing||{}),id,
    name:$('personalEventName').value.trim(),
    date:$('personalEventDate').value,
    time:$('personalEventAllDay').checked?'':$('personalEventTime').value,
    allDay:$('personalEventAllDay').checked,
    categoryId:$('personalEventCategory').value||'',
    comment:$('personalEventComment').value.trim(),
    link:safeHttpUrl($('personalEventLink').value.trim()),
    expense:Math.max(0,Number($('personalEventExpense').value||0)),
    createdAt:existing?.createdAt||new Date().toISOString()
  };
  if(!event.name) return toast('Напиши название события');
  try{ await persistPersonalEvent(event); closeModal('personalEvent'); toast('Событие сохранено'); }
  catch(error){ console.error(error); toast('Не удалось сохранить событие'); }
});
$('duplicatePersonalEventBtn').addEventListener('click',()=>{
  const sourceDate=$('personalEventDate').value||toISODate(new Date());
  const next=new Date(sourceDate+'T12:00:00'); next.setDate(next.getDate()+7);
  $('personalEventId').value=''; $('personalEventModalTitle').textContent='Дубликат события';
  $('personalEventDate').value=toISODate(next);
  $('deletePersonalEventBtn').classList.add('hidden'); $('duplicatePersonalEventBtn').classList.add('hidden');
  $('personalEventDate').focus(); toast('Дубликат поставлен через неделю — дату можно изменить');
});
$('deletePersonalEventBtn').addEventListener('click',async()=>{
  const id=$('personalEventId').value; if(!id) return;
  if(!confirm('Удалить событие?')) return;
  try{ await deleteCachedDoc('personalEvents',id); closeModal('personalEvent'); toast('Событие удалено'); }
  catch(error){ console.error(error); toast('Не удалось удалить событие'); }
});

function resetPersonalCategoryForm(){
  $('personalCategoryId').value=''; $('personalCategoryName').value='';
  $('personalCategoryColor').value=PERSONAL_CATEGORY_COLORS[0]; renderPersonalCategoryPalette(PERSONAL_CATEGORY_COLORS[0]);
  $('savePersonalCategoryBtn').textContent='+ Добавить категорию';
  $('cancelPersonalCategoryEditBtn').classList.add('hidden');
}
function openPersonalCategoryManager(){
  resetPersonalCategoryForm(); renderPersonalCategoryList(); $('personalCategoryModalBackdrop').hidden=false;
}
function renderPersonalCategoryList(){
  const box=$('personalCategoryList'); if(!box) return; box.innerHTML='';
  const categories=[...state.personalCategories].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'));
  if(!categories.length){ box.innerHTML='<div class="personal-category-empty">Пока нет категорий. Создай первую — например, «Спорт» или «Красота».</div>'; return; }
  categories.forEach(category=>{
    const row=document.createElement('div'); row.className='personal-category-row';
    row.innerHTML=`<span class="personal-category-title"><i style="--category-color:${category.color||'#e7e1dd'}"></i>${escapeHtml(category.name||'Категория')}</span><span class="personal-category-actions"><button type="button" class="ghost-btn category-edit-btn">Изменить</button><button type="button" class="ghost-btn category-delete-btn">Удалить</button></span>`;
    row.querySelector('.category-edit-btn').addEventListener('click',()=>{
      $('personalCategoryId').value=category.id; $('personalCategoryName').value=category.name||''; $('personalCategoryColor').value=category.color||PERSONAL_CATEGORY_COLORS[0];
      renderPersonalCategoryPalette(category.color||PERSONAL_CATEGORY_COLORS[0]); $('savePersonalCategoryBtn').textContent='Сохранить'; $('cancelPersonalCategoryEditBtn').classList.remove('hidden'); $('personalCategoryName').focus();
    });
    row.querySelector('.category-delete-btn').addEventListener('click',async()=>{
      if(!confirm(`Удалить категорию «${category.name}»? События останутся без категории.`)) return;
      const affected=state.personalEvents.filter(e=>e.categoryId===category.id);
      try{
        await Promise.all(affected.map(e=>persistPersonalEvent({...e,categoryId:''}))); await deleteCachedDoc('personalCategories',category.id);
        if($('personalEventCategory')?.value===category.id) $('personalEventCategory').value='';
        resetPersonalCategoryForm(); toast('Категория удалена');
      }catch(error){ console.error(error); toast('Не удалось удалить категорию'); }
    });
    box.appendChild(row);
  });
}
$('personalCategoryForm').addEventListener('submit',async(e)=>{
  e.preventDefault(); const existingId=$('personalCategoryId').value; const id=existingId||uid('personal_category'); const existing=getPersonalCategory(id);
  const category={...(existing||{}),id,name:$('personalCategoryName').value.trim(),color:$('personalCategoryColor').value||PERSONAL_CATEGORY_COLORS[0],createdAt:existing?.createdAt||new Date().toISOString()};
  if(!category.name) return toast('Напиши название категории');
  try{ await persistPersonalCategory(category); resetPersonalCategoryForm(); toast(existing?'Категория обновлена':'Категория добавлена'); }
  catch(error){ console.error(error); toast('Не удалось сохранить категорию'); }
});
$('cancelPersonalCategoryEditBtn').addEventListener('click',()=>resetPersonalCategoryForm());

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
    await syncLessonTopicsToStudentMap(lesson);
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
    try{ await deleteCachedDoc('lessons',id); closeModal('lesson'); toast('Занятие удалено'); }
    catch(error){console.error(error);toast('Не удалось удалить занятие');}
  }
});

document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
[$('lessonModalBackdrop'),$('studentModalBackdrop'),$('studentTopicModalBackdrop'),$('materialModalBackdrop'),$('trainerModalBackdrop'),$('folderModalBackdrop'),$('taskModalBackdrop'),$('personalEventModalBackdrop'),$('personalCategoryModalBackdrop')].filter(Boolean).forEach(backdrop=>backdrop.addEventListener('click',(e)=>{if(e.target===backdrop) backdrop.hidden=true;}));
function closeModal(type){
  const ids={lesson:'lessonModalBackdrop',student:'studentModalBackdrop',studentTopic:'studentTopicModalBackdrop',material:'materialModalBackdrop',trainer:'trainerModalBackdrop',folder:'folderModalBackdrop',task:'taskModalBackdrop',personalEvent:'personalEventModalBackdrop',personalCategory:'personalCategoryModalBackdrop'};
  if(ids[type]) $(ids[type]).hidden=true;
}

$('exportBtn').addEventListener('click',async()=>{
  try{
    setDataStatus('Готовлю резервную копию…','loading',false);
    await ensureCollections(ALL_COLLECTIONS,{force:true,showStatus:false});
    setDataStatus();
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),ownerUid:currentUser?.uid||null,...state},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`molemix-backup-${toISODate(new Date())}.json`; a.click(); URL.revokeObjectURL(url); toast('Резервная копия скачана');
  }catch(error){
    console.error(error);
    setDataStatus(dataErrorMessage(error),'error',true);
    toast('Не удалось подготовить полную резервную копию');
  }
});

$('retryDataBtn')?.addEventListener('click',()=>{
  refreshCurrentContext({force:true,showStatus:true});
});
async function maybeAutoRefresh(){
  if(!currentUser || document.hidden) return;
  const now=Date.now();
  if(now-lastAutoRefreshAt < 10*60*1000) return;
  lastAutoRefreshAt=now;
  await refreshCurrentContext({force:true,showStatus:false});
}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden) maybeAutoRefresh();
});
window.addEventListener('focus',()=>maybeAutoRefresh());

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
