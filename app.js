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

const state = { students: [], lessons: [] };
let currentDate = new Date();
currentDate.setDate(1);
let activeStudentId = null;
let currentUser = null;
let stopStudents = null;
let stopLessons = null;

const $ = (id) => document.getElementById(id);
const views = {
  calendar: $('calendarView'),
  students: $('studentsView'),
  studentDetail: $('studentDetailView')
};

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
function renderAll(){
  renderCalendar();
  renderStudents();
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
}
function stopCloudSync(){
  if(stopStudents){stopStudents();stopStudents=null;}
  if(stopLessons){stopLessons();stopLessons=null;}
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
    state.students=[]; state.lessons=[]; activeStudentId=null;
    $('appShell').hidden=true;
    $('authGate').hidden=false;
    $('authMessage').textContent='Войди в свой Google-аккаунт, чтобы загрузить учеников и занятия.';
  }
});

function switchView(name){
  Object.values(views).forEach(v=>v.classList.remove('active-view'));
  views[name].classList.add('active-view');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  if(name==='calendar') renderCalendar();
  if(name==='students') renderStudents();
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
  const paid = monthLessons.filter(l=>l.paid && !l.cancelled).reduce((s,l)=>s+Number(l.price||0),0);
  const unpaid = monthLessons.filter(l=>l.conducted && !l.paid && !l.cancelled).reduce((s,l)=>s+Number(l.price||0),0);
  const conducted = monthLessons.filter(l=>l.conducted && !l.cancelled).length;
  $('paidTotal').textContent = money(paid);
  $('unpaidTotal').textContent = money(unpaid);
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
    const pay=l.cancelled?'<span class="status-badge bad">Отменено</span>':(l.paid?'<span class="status-badge good">✓ '+money(l.price)+'</span>':'<span class="status-badge wait">○ '+money(l.price)+'</span>');
    return `<tr data-open-lesson="${l.id}" style="cursor:pointer">
      <td data-label="Дата">${formatDateRu(l.date,false)}<br><small>${escapeHtml(l.time||'')}</small></td>
      <td data-label="Тема">${topics}</td>
      <td data-label="ДЗ">${hw}</td>
      <td data-label="Оплата">${pay}</td>
      <td data-label="Комментарий">${escapeHtml(l.comment||'—')}</td>
    </tr>`;
  }).join('');
  return `<table class="journal-table"><thead><tr><th>Дата</th><th>Тема / прогресс</th><th>ДЗ</th><th>Оплата</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function homeworkBadge(v){
  if(v==='sent') return '<span class="status-badge good">✓ Отправлено</span>';
  if(v==='todo') return '<span class="status-badge wait">⏳ Нужно отправить</span>';
  return '<span class="status-badge none">— Не задано</span>';
}

$('addStudentBtn').addEventListener('click',()=>openStudentModal());
function openStudentModal(id=null){
  const s=id?getStudent(id):null;
  $('studentModalTitle').textContent=s?'Редактировать ученика':'Новый ученик';
  $('studentId').value=s?.id||'';
  $('studentName').value=s?.name||'';
  $('studentClass').value=s?.className||'';
  $('studentPrice').value=s?.price||'';
  $('studentColor').value=s?.color||'#cdb7f6';
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
  $('lessonComment').value=l?.comment||'';
  $('lessonConducted').checked=!!l?.conducted;
  $('lessonPaid').checked=!!l?.paid;
  $('lessonCancelled').checked=!!l?.cancelled;
  $('topicsEditor').innerHTML='';
  (l?.topics?.length?l.topics:[{name:'',progress:''}]).forEach(addTopicRow);
  $('deleteLessonBtn').classList.toggle('hidden',!l);
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
$('deleteLessonBtn').addEventListener('click',async()=>{
  const id=$('lessonId').value; if(!id)return;
  if(confirm('Удалить занятие? Для отменённых занятий лучше использовать статус «Отменено» — так история сохранится.')){
    try{ await deleteDoc(userDoc('lessons',id)); closeModal('lesson'); toast('Занятие удалено'); }
    catch(error){console.error(error);toast('Не удалось удалить занятие');}
  }
});

document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
[$('lessonModalBackdrop'),$('studentModalBackdrop')].forEach(backdrop=>backdrop.addEventListener('click',(e)=>{if(e.target===backdrop) backdrop.hidden=true;}));
function closeModal(type){ $(type==='lesson'?'lessonModalBackdrop':'studentModalBackdrop').hidden=true; }

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
