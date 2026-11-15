/* ============ CONFIGURAÇÃO ============ */
const CONFIG = {
  whatsapp: '5587999999999', // WhatsApp da profissional (DDI+DDD+número)
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
  { id: 'gel',   name: 'Esmaltação em gel',         desc: 'Cor intensa e brilho que dura até 3 semanas.',      price: 55,  mins: 60 },
  { id: 'trad',  name: 'Manicure tradicional',      desc: 'Cutilagem delicada e esmaltação clássica.',         price: 30,  mins: 45 },
  { id: 'pedi',  name: 'Pedicure',                  desc: 'Cuidado completo para pés leves e macios.',         price: 40,  mins: 60 },
  { id: 'fibra', name: 'Alongamento em fibra',      desc: 'Formato perfeito, leve e resistente.',              price: 180, mins: 150 },
  { id: 'manut', name: 'Manutenção do alongamento', desc: 'Reposição e acabamento a cada 15–20 dias.',         price: 120, mins: 120 },
  { id: 'bind',  name: 'Blindagem',                 desc: 'Reforço que protege e fortalece a unha natural.',   price: 80,  mins: 90 },
  { id: 'art',   name: 'Nail art',                  desc: 'Decorações, francesinha, pedrarias e mais.',        price: 25,  mins: 30 },
  { id: 'spa',   name: 'Spa dos pés',               desc: 'Esfoliação, hidratação e massagem relaxante.',      price: 70,  mins: 60 },
];

// Para usar fotos reais: { t: 'Título', img: 'static/foto1.jpg', c: [...] }
const STORIES = [
  { name: 'Gel',         slides: [{ t: 'Esmaltação em gel', c: ['#EFE3D4', '#DBBAA5'] }, { t: 'Brilho que dura', c: ['#DBBAA5', '#9D7D62'] }] },
  { name: 'Alongamento', slides: [{ t: 'Alongamento em fibra', c: ['#9D7D62', '#593D29'] }, { t: 'Formato perfeito', c: ['#DBBAA5', '#593D29'] }] },
  { name: 'Nail art',    slides: [{ t: 'Nail art delicada', c: ['#B89E5D', '#593D29'] }, { t: 'Detalhes únicos', c: ['#EFE3D4', '#B89E5D'] }] },
  { name: 'Francesinha', slides: [{ t: 'Francesinha clássica', c: ['#EFE3D4', '#9D7D62'] }, { t: 'Elegância atemporal', c: ['#DBBAA5', '#B89E5D'] }] },
  { name: 'Pedicure',    slides: [{ t: 'Pés cuidados', c: ['#DBBAA5', '#9D7D62'] }, { t: 'Spa dos pés', c: ['#9D7D62', '#EFE3D4'] }] },
];

const REVIEWS = [
  ['Atendimento impecável! Minhas unhas duraram mais de 3 semanas e o acabamento é perfeito.', 'Mariana S.'],
  ['Ambiente aconchegante, super pontual e cuidadosa. Já virei cliente fiel.', 'Camila R.'],
  ['Melhor alongamento que já fiz. Natural, leve e lindo demais!', 'Juliana A.'],
  ['Agendei pelo site em segundos e o resultado superou minhas expectativas.', 'Beatriz L.'],
];

/* ============ PÁGINA INICIAL (index.html) ============ */
function initHome() {
  $('#svcGrid').innerHTML = SERVICES.map(s => `
    <a class="card rv" href="agendamento.html?s=${s.id}"><h3>${s.name}</h3><p>${s.desc}</p>
    <div class="meta"><span>⏱ ${dur(s.mins)}</span><b>${fmt(s.price)}</b></div><span class="go">Agendar →</span></a>`).join('');

  $('#rev').innerHTML = REVIEWS.map(r => `
    <article><div class="stars">★★★★★</div><p>“${r[0]}”</p><b>${r[1]}</b></article>`).join('');

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
    const btn = $('#confirm'); btn.disabled = true; btn.textContent = 'Enviando…';
    const nome = $('#nome').value.trim(), tel = $('#tel').value.replace(/\D/g, '');
    const servicos = [...st.sel].map(id => SERVICES.find(s => s.id === id).name);
    const mensagem = `Olá, ${nome}! ✨\nSeu agendamento na *Thaís Mendes Nails* foi recebido:\n\n💅 ${servicos.join(', ')}\n📅 ${longDate(st.date)}\n🕐 ${st.time}\n💰 ${fmt(sumOf('price'))}\n\nQualquer dúvida, é só responder esta mensagem. Te espero! 🤎`;
    const payload = { nome, whatsapp: '55' + tel, servicos, duracao_min: sumOf('mins'), total: sumOf('price'), data: st.date, hora: st.time, mensagem };

    try {
      await api('/agendamentos', { method: 'POST', body: { nome, whatsapp: '55' + tel, servico_ids: [...st.sel], data: st.date, hora: st.time } });
    } catch (e) {
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

    $('#okTxt').textContent = `${nome.split(' ')[0]}, você receberá a confirmação no WhatsApp (${$('#tel').value}) com todos os detalhes para ${longDate(st.date)} às ${st.time}.`;
    $('#okWa').href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Olá! Acabei de agendar pelo site.\n\n' + mensagem.replace(`Olá, ${nome}! ✨\n`, `Cliente: ${nome}\n`))}`;
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
