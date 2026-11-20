/* ============ CONFIGURAÇÃO ============ */
const CONFIG = {
  whatsapp: '5587981113576', // WhatsApp da profissional (DDI+DDD+número)
  webhook: ''                // URL do n8n / Evolution API / Z-API que dispara a mensagem
};

/* ============ UTILITÁRIOS ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`;

/* ============ API ============ */
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.erro || 'Erro de conexão'); e.status = r.status; throw e; }
  return data;
}

/* ============ DADOS (lista de reserva; a oficial vem de /api/servicos) ============ */
let SERVICES = [
  { id: 'man_ped',  name: 'Manicure + Pedicure',      desc: 'Cutilagem delicada, cuidado para pés e esmaltação clássica.',         price: 35,  mins: 90 },
  { id: 'mani',  name: 'Manicure',      desc: 'Cutilagem delicada e esmaltação clássica.',         price: 20,  mins: 50 },
  { id: 'pedi',  name: 'Pedicure',                  desc: 'Cuidado completo para pés leves e macios.',         price: 20,  mins: 50 },
  { id: 'gel_m',   name: 'Cutilagem + Esmaltação em gel (mão)',         desc: 'Cor intensa e brilho que dura até 3 semanas.',      price: 50,  mins: 60 },
  { id: 'gel_p',   name: 'Cutilagem + Esmaltação em gel (pé)',         desc: 'Cor intensa e brilho que dura até 3 semanas.',      price: 50,  mins: 60 },
  { id: 'plast', name: 'Plásticas dos pés + Pedicure',      desc: 'Tratamento completo para renovar, suavizar e cuidar dos pés.',              price: 45, mins: 90 },
  { id: 'esm_m', name: 'Esmaltação tradicional (mão)', desc: 'Cores clássicas, brilho e acabamento delicado para suas mãos.',         price: 10, mins: 30 },
  { id: 'esm_p',  name: 'Esmaltação tradicional (pé)',                 desc: 'Unhas dos pés com cor, brilho e acabamento impecável.',   price: 10,  mins: 30 },
];

const STORIES = [
  { name: 'Gel',         slides: [{ t: 'Esmaltação em gel', img: '../static/gel1.jpeg', c: ['#EFE3D4', '#DBBAA5'] }, { img: '../static/gel2.jpeg', c: ['#DBBAA5', '#9D7D62'] }, { img: '../static/gel3.jpeg', c: ['#DBBAA5', '#9D7D62'] }, { img: '../static/gel4.jpeg', c: ['#DBBAA5', '#9D7D62'] }, { img: '../static/gel5.jpeg', c: ['#DBBAA5', '#9D7D62'] }] },
  { name: 'Alongamento', slides: [{ t: 'Alongamento em fibra', c: ['#9D7D62', '#593D29'] }, { t: 'Formato perfeito', c: ['#DBBAA5', '#593D29'] }] },
  { name: 'Spa dos Pés',    slides: [{ t: 'Pés cuidados', c: ['#B89E5D', '#593D29'] }, { t: 'Detalhes únicos', c: ['#EFE3D4', '#B89E5D'] }] },
  { name: 'Francesinha', slides: [{ t: 'Francesinha clássica', c: ['#EFE3D4', '#9D7D62'] }, { t: 'Elegância atemporal', c: ['#DBBAA5', '#B89E5D'] }] },
  { name: 'Pedicure',    slides: [{ t: 'Beleza nos pés', c: ['#DBBAA5', '#9D7D62'] }, { t: 'Spa dos pés', c: ['#9D7D62', '#EFE3D4'] }] },
];

const REVIEWS = [
  ['Atendimento impecável! Minhas unhas duraram muito, e o acabamento é perfeito.', 'Luciene A.'],
  ['Ambiente aconchegante, super pontual e cuidadosa. Já virei cliente fiel.', 'M. Jamile'],
  ['Melhor alongamento que já fiz. Natural, leve e lindo demais!', 'Kelly S.'],
  ['Agendei pelo site em segundos e o resultado superou minhas expectativas.', 'Joelma M.'],
];

/* ============ PÁGINA INICIAL (index.html) ============ */
function initHome() {
  $('#svcGrid').innerHTML = SERVICES.map(s => `
    <a class="card rv" href="agendamento.html?s=${s.id}"><h3>${s.name}</h3><p>${s.desc}</p>
    <div class="meta"><span>⏱ ${dur(s.mins)}</span><b>${fmt(s.price)}</b></div><span class="go">Agendar →</span></a>`).join('');

  $('#rev').innerHTML = REVIEWS.map((r, i) => `
    <article><div class="stars" aria-label="5 estrelas">${'<img src="static/ico-estrela.svg" alt="" width="18" height="18">'.repeat(5)}</div>
    <p>“${r[0]}”</p>
    <div class="who" style="display:flex;flex-direction:row;align-items:center;gap:.9rem;margin-top:1.4rem"><img src="static/avatar-${i + 1}.png" alt="${r[1]}" width="48" height="48" loading="lazy" style="width:48px;height:48px;min-width:48px;border-radius:50%;object-fit:cover;aspect-ratio:1/1;flex:none;border:2px solid #B89E5D" onerror="this.style.display='none'"><b>${r[1]}</b></div></article>`).join('');

  const bgOf = s => s.img ? `url(${s.img})` : `linear-gradient(160deg,${s.c[0]},${s.c[1]})`;
  $('#hl').innerHTML = STORIES.map((s, i) => `
    <button data-st="${i}"><div class="ring"><i style="background-image:${bgOf(s.slides[0])}"></i></div><span>${s.name}</span></button>`).join('');

  /* ----- Stories ----- */
  const SLIDE_MS = 5000;
  let si = 0, sj = 0, sp = 0, timer, held = false;

  const openStory = i => { si = i; sj = 0; $('#sv').hidden = false; document.body.style.overflow = 'hidden'; showSlide(); };
  const closeStory = () => { clearInterval(timer); $('#sv').hidden = true; document.body.style.overflow = ''; };

  function showSlide() {
    const st = STORIES[si], sl = st.slides[sj];
    $('#svBg').style.backgroundImage = bgOf(sl);
    $('#svName').textContent = st.name;
    $('#svTitle').textContent = sl.t;
    $('#svBars').innerHTML = st.slides.map(() => '<div><i></i></div>').join('');
    $$('#svBars i').forEach((el, k) => el.style.width = k < sj ? '100%' : '0');
    sp = 0; clearInterval(timer);
    timer = setInterval(() => {
      if (held) return;
      sp += 50;
      $$('#svBars i')[sj].style.width = (sp / SLIDE_MS * 100) + '%';
      if (sp >= SLIDE_MS) next();
    }, 50);
  }
  function next() {
    if (sj < STORIES[si].slides.length - 1) { sj++; showSlide(); }
    else if (si < STORIES.length - 1) { si++; sj = 0; showSlide(); }
    else closeStory();
  }
  function prev() {
    if (sj > 0) { sj--; showSlide(); }
    else if (si > 0) { si--; sj = 0; showSlide(); }
    else showSlide();
  }

  $('#hl').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) openStory(+b.dataset.st); });
  $('#svNext').onclick = next;
  $('#svPrev').onclick = prev;
  $('#svClose').onclick = closeStory;
  ['mousedown', 'touchstart'].forEach(ev => $('.sv-card').addEventListener(ev, () => held = true, { passive: true }));
  ['mouseup', 'touchend', 'mouseleave'].forEach(ev => $('.sv-card').addEventListener(ev, () => held = false));
  addEventListener('keydown', e => {
    if ($('#sv').hidden) return;
    if (e.key === 'Escape') closeStory();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });
}

/* ============ AGENDAMENTO (agendamento.html) ============ */
function initBooking() {
  const st = { sel: new Set(), date: null, time: null };
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateObj = k => { const [y, m, d] = k.split('-'); return new Date(+y, m - 1, +d); };
  const longDate = k => dateObj(k).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const sumOf = prop => [...st.sel].reduce((a, id) => a + SERVICES.find(s => s.id === id)[prop], 0);

  /* Serviços */
  $('#bkServices').innerHTML = SERVICES.map(s => `
    <label class="opt"><input type="checkbox" value="${s.id}">
    <span class="opt-body"><b>${s.name}</b><small>${dur(s.mins)}</small></span><em>${fmt(s.price)}</em></label>`).join('');
  $('#bkServices').addEventListener('change', e => {
    e.target.checked ? st.sel.add(e.target.value) : st.sel.delete(e.target.value);
    st.time = null; renderSlots(); renderSum();
  });

  /* Serviço pré-selecionado via ?s=id (vindo dos cards da home) */
  const pre = new URLSearchParams(location.search).get('s');
  const preEl = pre && $(`#bkServices input[value="${pre}"]`);
  if (preEl) {
    const row = preEl.closest('.opt');
    preEl.checked = true; st.sel.add(pre);
    setTimeout(() => { row.classList.add('pop'); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 450);
    setTimeout(() => row.classList.remove('pop'), 3200);
  }

  /* Dias (próximos 21; domingo fechado) */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const WD = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  $('#bkDays').innerHTML = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    return `<button class="day" data-d="${key(d)}"><small>${WD[d.getDay()]}</small><b>${d.getDate()}</b><small>${mes}</small></button>`;
  }).join('');
  $('#bkDays').addEventListener('click', e => {
    const b = e.target.closest('.day'); if (!b) return;
    $$('.day').forEach(x => x.classList.remove('on')); b.classList.add('on');
    st.date = b.dataset.d; st.time = null; renderSlots(); renderSum();
  });

  /* Horários livres vindos da API (já descontam dias de trabalho, folgas e agendamentos) */
  let slotsReq = 0;
  async function renderSlots() {
    const box = $('#bkSlots');
    if (!st.sel.size) return box.innerHTML = '<p class="hint">Selecione os serviços para ver os horários.</p>';
    if (!st.date) return box.innerHTML = '<p class="hint">Escolha uma data.</p>';
    const req = ++slotsReq;
    box.innerHTML = '<p class="hint">Buscando horários…</p>';
    try {
      const { slots } = await api(`/horarios-livres?data=${st.date}&servicos=${[...st.sel].join(',')}`);
      if (req !== slotsReq) return;
      if (st.time && !slots.includes(st.time)) { st.time = null; renderSum(); }
      box.innerHTML = slots.length
        ? slots.map(t => `<button class="slot ${st.time === t ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')
        : '<p class="hint">Sem horários disponíveis nesta data. Tente outro dia.</p>';
    } catch (e) {
      if (req === slotsReq) box.innerHTML = `<p class="hint">${e.message}</p>`;
    }
  }
  $('#bkSlots').addEventListener('click', e => {
    const b = e.target.closest('.slot'); if (!b) return;
    st.time = b.dataset.t;
    $$('.slot').forEach(x => x.classList.toggle('on', x === b));
    renderSum();
  });

  /* Dados da cliente */
  $('#tel').addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    v = v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
    e.target.value = v; renderSum();
  });
  $('#nome').addEventListener('input', renderSum);

  /* Resumo */
  function renderSum() {
    $('#sumList').innerHTML = st.sel.size
      ? [...st.sel].map(id => { const s = SERVICES.find(x => x.id === id); return `<li><span>${s.name}</span><span>${fmt(s.price)}</span></li>`; }).join('')
      : '<li style="opacity:.6">Nenhum serviço selecionado</li>';
    $('#sumDur').textContent = st.sel.size ? dur(sumOf('mins')) : '—';
    $('#sumDate').textContent = st.date ? dateObj(st.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';
    $('#sumTime').textContent = st.time || '—';
    $('#sumTotal').textContent = fmt(sumOf('price'));
    $('#confirm').disabled = !(st.sel.size && st.date && st.time &&
      $('#nome').value.trim().length > 2 && $('#tel').value.replace(/\D/g, '').length >= 10);
  }

  /* Confirmação */
  $('#confirm').addEventListener('click', async () => {
    const wa = window.open('', '_blank'); // abre já no clique para o navegador não bloquear
    const btn = $('#confirm'); btn.disabled = true; btn.textContent = 'Enviando…';
    const nome = $('#nome').value.trim(), tel = $('#tel').value.replace(/\D/g, '');
    const servicos = [...st.sel].map(id => SERVICES.find(s => s.id === id).name);
    const mensagem = `Olá, ${nome}! ✨\nSeu agendamento na *Thaís Mendes Nails* foi recebido:\n\n💅 ${servicos.join(', ')}\n📅 ${longDate(st.date)}\n🕐 ${st.time}\n💰 ${fmt(sumOf('price'))}\n\nQualquer dúvida, é só responder esta mensagem. Te espero! 🤎`;
    const payload = { nome, whatsapp: '55' + tel, servicos, duracao_min: sumOf('mins'), total: sumOf('price'), data: st.date, hora: st.time, mensagem };

    try {
      await api('/agendamentos', { method: 'POST', body: { nome, whatsapp: '55' + tel, servico_ids: [...st.sel], data: st.date, hora: st.time } });
    } catch (e) {
      if (wa) wa.close();
      alert(e.message);
      btn.textContent = 'Confirmar agendamento';
      if (e.status === 409) { st.time = null; renderSlots(); }
      renderSum();
      return;
    }

    if (CONFIG.webhook) {
      try { await fetch(CONFIG.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
      catch (_) { /* segue para a tela de sucesso; a cliente ainda pode usar o botão do WhatsApp */ }
    }

    $('#okTxt').textContent = `${nome.split(' ')[0]}, seu horário para ${longDate(st.date)} às ${st.time} está reservado! Envie a mensagem no WhatsApp para a Thaís confirmar com você. Se ele não abriu, toque no botão abaixo.`;
    const msgProf = `Olá, Thaís! Sou ${nome} e acabei de agendar pelo site:\n\n💅 ${servicos.join(', ')}\n📅 ${longDate(st.date)}\n🕐 ${st.time}\n💰 ${fmt(sumOf('price'))}\n📱 ${$('#tel').value}`;
    const waUrl = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msgProf)}`;
    $('#okWa').href = waUrl;
    if (wa) wa.location.href = waUrl;
    $('#bkForm').hidden = true; $('#bkOk').hidden = false;
    scrollTo({ top: 0, behavior: 'smooth' });
    btn.textContent = 'Confirmar agendamento';
  });

  renderSlots(); renderSum();
}

/* ============ INICIALIZAÇÃO ============ */
(async () => {
  try { SERVICES = await api('/servicos'); } catch (_) { /* usa a lista de reserva */ }
  if ($('#svcGrid')) initHome();
  if ($('#bkForm')) initBooking();
  $$('.rv').forEach(el => io.observe(el));
})();

const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12 });
$$('.rv').forEach(el => io.observe(el));
