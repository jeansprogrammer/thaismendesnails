import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const sql = neon(process.env.DATABASE_URL);
const TZ = 'America/Recife';
const OFFSET = '-03:00';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ST_IN = { confirmado: 'confirmed', concluido: 'done', cancelado: 'canceled', pendente: 'confirmed' };
const ST_OUT = { confirmed: 'confirmado', done: 'concluido', canceled: 'cancelado', no_show: 'cancelado' };

class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const bad = (m, s = 400) => { throw new HttpError(s, m); };
const toMin = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };
const nowLocal = () => {
  const [date, t] = new Date().toLocaleString('sv-SE', { timeZone: TZ }).split(' ');
  return { date, min: toMin(t) };
};
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function auth(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return bad('Não autorizado', 401); }
}

/* ---------- Login ---------- */
async function login({ email, senha }) {
  if (!email || !senha) bad('Informe e-mail e senha');
  const [u] = await sql`SELECT id, password_hash FROM admin_users WHERE email = ${String(email).toLowerCase().trim()}`;
  const ok = u ? await bcrypt.compare(String(senha), u.password_hash) : false;
  if (!ok) bad('E-mail ou senha incorretos', 401);
  return { token: jwt.sign({ uid: u.id }, process.env.JWT_SECRET, { expiresIn: '30d' }) };
}

/* ---------- Serviços ---------- */
async function listServices() {
  const rows = await sql`SELECT id, name, description AS "desc", price, minutes AS mins
                         FROM services WHERE active ORDER BY sort_order`;
  return rows.map(r => ({ ...r, price: Number(r.price) }));
}
async function setPrice(id, { price }) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0 || p > 100000) bad('Preço inválido');
  const r = await sql`UPDATE services SET price = ${p}, updated_at = now() WHERE id = ${id} RETURNING id`;
  if (!r.length) bad('Serviço não encontrado', 404);
  return { ok: true };
}

/* ---------- Horários livres ---------- */
async function freeSlots(date, need, ignoreId = 0) {
  const today = nowLocal();
  if (date < today.date) return [];
  const wd = new Date(date + 'T12:00:00Z').getUTCDay();
  const [hours, off, busy] = await Promise.all([
    sql`SELECT to_char(start_time,'HH24:MI') a, to_char(end_time,'HH24:MI') b
        FROM working_hours WHERE weekday = ${wd} ORDER BY start_time`,
    sql`SELECT to_char(start_time,'HH24:MI') a, to_char(end_time,'HH24:MI') b
        FROM time_off WHERE day = ${date}`,
    sql`SELECT (EXTRACT(HOUR FROM starts_at AT TIME ZONE ${TZ})*60 + EXTRACT(MINUTE FROM starts_at AT TIME ZONE ${TZ}))::int a,
               (EXTRACT(HOUR FROM ends_at AT TIME ZONE ${TZ})*60 + EXTRACT(MINUTE FROM ends_at AT TIME ZONE ${TZ}))::int b
        FROM appointments
        WHERE status IN ('confirmed','done') AND (starts_at AT TIME ZONE ${TZ})::date = ${date} AND id <> ${ignoreId}`,
  ]);
  if (off.some(o => !o.a)) return [];
  const blocked = [...off.map(o => [toMin(o.a), toMin(o.b)]), ...busy.map(x => [x.a, x.b])];
  const minStart = date === today.date ? today.min + 60 : 0;
  const out = [];
  for (const h of hours) {
    for (let t = toMin(h.a); t + need <= toMin(h.b); t += 30) {
      if (t < minStart) continue;
      if (blocked.some(([x, y]) => t < y && t + need > x)) continue;
      out.push(hhmm(t));
    }
  }
  return out;
}
async function slotsRoute(q) {
  const data = q.get('data');
  if (!DATE_RE.test(data || '')) bad('Data inválida');
  const ids = (q.get('servicos') || '').split(',').filter(Boolean);
  if (!ids.length) bad('Escolha ao menos um serviço');
  const [r] = await sql`SELECT COALESCE(SUM(minutes),0)::int AS m, COUNT(*)::int AS n
                        FROM services WHERE active AND id = ANY(${ids})`;
  if (r.n !== ids.length) bad('Serviço inválido');
  return { slots: await freeSlots(data, r.m) };
}

/* ---------- Agendar (cliente) ---------- */
async function book(b) {
  const nome = String(b.nome || '').trim().slice(0, 80);
  const wa = String(b.whatsapp || '').replace(/\D/g, '');
  const { data, hora } = b;
  const ids = [...new Set(b.servico_ids || b.servicos || [])].map(String);
  if (nome.length < 3) bad('Informe seu nome');
  if (!/^55\d{10,11}$/.test(wa)) bad('WhatsApp inválido');
  if (!DATE_RE.test(data || '') || !TIME_RE.test(hora || '')) bad('Data ou horário inválido');
  if (!ids.length || ids.length > 8) bad('Escolha os serviços');

  // aceita ids ou nomes (o script.js atual envia nomes)
  const svcs = await sql`SELECT id, price, minutes FROM services
                         WHERE active AND (id = ANY(${ids}) OR name = ANY(${ids}))`;
  if (svcs.length !== ids.length) bad('Serviço inválido');
  const need = svcs.reduce((t, s) => t + s.minutes, 0);
  const total = svcs.reduce((t, s) => t + Number(s.price), 0);

  if (!(await freeSlots(data, need)).includes(hora)) bad('Esse horário acabou de ser ocupado. Escolha outro.', 409);

  const start = `${data}T${hora}:00${OFFSET}`;
  const end = new Date(new Date(start).getTime() + need * 60000).toISOString();
  try {
    const r = await sql`
      WITH c AS (
        INSERT INTO customers (name, whatsapp) VALUES (${nome}, ${wa})
        ON CONFLICT (whatsapp) DO UPDATE SET name = customers.name RETURNING id
      ), a AS (
        INSERT INTO appointments (customer_id, starts_at, ends_at, total_price)
        SELECT id, ${start}::timestamptz, ${end}::timestamptz, ${total} FROM c RETURNING id
      )
      INSERT INTO appointment_services (appointment_id, service_id, price, minutes)
      SELECT a.id, s.id, s.price, s.minutes FROM a, services s WHERE s.id = ANY(${svcs.map(s => s.id)})
      RETURNING appointment_id`;
    return { ok: true, id: r[0].appointment_id };
  } catch (e) {
    if (e.code === '23P01') bad('Esse horário acabou de ser ocupado. Escolha outro.', 409);
    throw e;
  }
}

/* ---------- Agenda (admin) ---------- */
async function agenda(q) {
  const t = nowLocal().date;
  const de = q.get('de') || q.get('data') || t;
  const ate = q.get('ate') || q.get('data') || de;
  if (!DATE_RE.test(de) || !DATE_RE.test(ate)) bad('Datas inválidas');
  const rows = await sql`
    SELECT a.id,
           to_char(a.starts_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS date,
           (EXTRACT(HOUR FROM a.starts_at AT TIME ZONE ${TZ})*60 + EXTRACT(MINUTE FROM a.starts_at AT TIME ZONE ${TZ}))::int AS start,
           c.name AS client, c.whatsapp AS phone, a.status, a.total_price AS total, a.cancel_reason AS reason,
           COALESCE(array_agg(s.service_id) FILTER (WHERE s.service_id IS NOT NULL), '{}') AS svc
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN appointment_services s ON s.appointment_id = a.id
    WHERE (a.starts_at AT TIME ZONE ${TZ})::date BETWEEN ${de}::date AND ${ate}::date
    GROUP BY a.id, c.id
    ORDER BY a.starts_at`;
  return rows.map(r => ({ ...r, phone: r.phone.replace(/^55/, ''), total: Number(r.total), status: ST_OUT[r.status] }));
}
async function setStatus(id, { status, motivo }) {
  const st = ST_IN[status];
  if (!st) bad('Status inválido');
  const why = st === 'canceled' ? (String(motivo || '').trim().slice(0, 200) || null) : null;
  try {
    const r = await sql`UPDATE appointments SET status = ${st}, cancel_reason = ${why} WHERE id = ${Number(id)} RETURNING id`;
    if (!r.length) bad('Agendamento não encontrado', 404);
    return { ok: true };
  } catch (e) {
    if (e.code === '23P01') bad('Esse horário já está ocupado por outro agendamento', 409);
    throw e;
  }
}

/* ---------- Reagendar ---------- */
async function reschedSlots(id, q) {
  const data = q.get('data');
  if (!DATE_RE.test(data || '')) bad('Data inválida');
  const [a] = await sql`SELECT (EXTRACT(EPOCH FROM ends_at - starts_at)/60)::int AS m FROM appointments WHERE id = ${Number(id)}`;
  if (!a) bad('Agendamento não encontrado', 404);
  return { slots: await freeSlots(data, a.m, Number(id)) };
}
async function reschedule(id, { data, hora }) {
  if (!DATE_RE.test(data || '') || !TIME_RE.test(hora || '')) bad('Data ou horário inválido');
  const [a] = await sql`SELECT status, (EXTRACT(EPOCH FROM ends_at - starts_at)/60)::int AS m
                        FROM appointments WHERE id = ${Number(id)}`;
  if (!a) bad('Agendamento não encontrado', 404);
  if (a.status !== 'confirmed') bad('Só é possível reagendar agendamentos confirmados');
  if (!(await freeSlots(data, a.m, Number(id))).includes(hora)) bad('Horário indisponível. Escolha outro.', 409);
  const start = `${data}T${hora}:00${OFFSET}`;
  const end = new Date(new Date(start).getTime() + a.m * 60000).toISOString();
  try {
    await sql`UPDATE appointments
              SET rescheduled_from = starts_at, starts_at = ${start}::timestamptz, ends_at = ${end}::timestamptz
              WHERE id = ${Number(id)}`;
    return { ok: true };
  } catch (e) {
    if (e.code === '23P01') bad('Esse horário já está ocupado por outro agendamento', 409);
    throw e;
  }
}

/* ---------- Mensagens prontas ---------- */
async function listTemplates() {
  return sql`SELECT key, title, body FROM message_templates ORDER BY sort_order`;
}
async function setTemplate(key, { body }) {
  const t = String(body || '').trim();
  if (t.length < 5 || t.length > 1000) bad('A mensagem deve ter entre 5 e 1000 caracteres');
  const r = await sql`UPDATE message_templates SET body = ${t}, updated_at = now() WHERE key = ${key} RETURNING key`;
  if (!r.length) bad('Modelo não encontrado', 404);
  return { ok: true };
}

/* ---------- Dias e horários de trabalho ---------- */
async function getSchedule() {
  const sched = Array.from({ length: 7 }, () => ({ open: false, a1: '09:00', b1: '12:00', a2: '', b2: '' }));
  const rows = await sql`SELECT weekday w, to_char(start_time,'HH24:MI') a, to_char(end_time,'HH24:MI') b
                         FROM working_hours ORDER BY weekday, start_time`;
  const seen = {};
  for (const r of rows) {
    const s = sched[r.w];
    if (!seen[r.w]) { Object.assign(s, { open: true, a1: r.a, b1: r.b }); seen[r.w] = 1; }
    else Object.assign(s, { a2: r.a, b2: r.b });
  }
  return sched;
}
async function putSchedule(arr) {
  if (!Array.isArray(arr) || arr.length !== 7) bad('Formato inválido');
  const q = [sql`DELETE FROM working_hours`];
  arr.forEach((s, i) => {
    if (!s.open) return;
    if (!TIME_RE.test(s.a1) || !TIME_RE.test(s.b1) || s.a1 >= s.b1) bad('Horário da manhã inválido');
    q.push(sql`INSERT INTO working_hours (weekday, start_time, end_time) VALUES (${i}, ${s.a1}, ${s.b1})`);
    if (s.a2 || s.b2) {
      if (!TIME_RE.test(s.a2) || !TIME_RE.test(s.b2) || s.a2 < s.b1 || s.a2 >= s.b2) bad('Horário da tarde inválido');
      q.push(sql`INSERT INTO working_hours (weekday, start_time, end_time) VALUES (${i}, ${s.a2}, ${s.b2})`);
    }
  });
  await sql.transaction(q);
  return { ok: true };
}

/* ---------- Folgas ---------- */
async function listOff() {
  return sql`SELECT to_char(day,'YYYY-MM-DD') AS day, COALESCE(reason,'Folga') AS reason
             FROM time_off WHERE start_time IS NULL AND day >= ${nowLocal().date}::date ORDER BY day`;
}
async function addOff({ from, to, reason }) {
  const t = to || from;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(t)) bad('Datas inválidas');
  if (from < nowLocal().date) bad('Escolha uma data a partir de hoje');
  if (t < from) bad('A data final vem antes da inicial');
  if ((new Date(t) - new Date(from)) / 864e5 > 90) bad('Período máximo: 90 dias');
  const why = String(reason || 'Folga').trim().slice(0, 60) || 'Folga';
  await sql.transaction([
    sql`DELETE FROM time_off WHERE start_time IS NULL AND day BETWEEN ${from}::date AND ${t}::date`,
    sql`INSERT INTO time_off (day, reason)
        SELECT d::date, ${why} FROM generate_series(${from}::date, ${t}::date, interval '1 day') d`,
  ]);
  return { ok: true };
}
async function delOff(q) {
  const de = q.get('de'), ate = q.get('ate') || de;
  if (!DATE_RE.test(de || '') || !DATE_RE.test(ate)) bad('Datas inválidas');
  await sql`DELETE FROM time_off WHERE start_time IS NULL AND day BETWEEN ${de}::date AND ${ate}::date`;
  return { ok: true };
}

/* ---------- Roteador ---------- */
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/\/+$/, '');
    const q = url.searchParams, m = req.method;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const priv = fn => { auth(req); return fn(); };
    let id, r;

    if (m === 'POST' && path === '/api/login') r = await login(body);
    else if (m === 'GET' && path === '/api/servicos') r = await listServices();
    else if (m === 'GET' && path === '/api/horarios-livres') r = await slotsRoute(q);
    else if (m === 'POST' && path === '/api/agendamentos') r = await book(body);
    else if (m === 'PUT' && (id = path.match(/^\/api\/servicos\/([\w-]+)$/))) r = await priv(() => setPrice(id[1], body));
    else if (m === 'GET' && path === '/api/agenda') r = await priv(() => agenda(q));
    else if (m === 'PATCH' && (id = path.match(/^\/api\/agendamentos\/(\d+)$/))) r = await priv(() => setStatus(id[1], body));
    else if (m === 'GET' && path === '/api/horarios') r = await priv(getSchedule);
    else if (m === 'PUT' && path === '/api/horarios') r = await priv(() => putSchedule(req.body));
    else if (m === 'GET' && path === '/api/folgas') r = await priv(listOff);
    else if (m === 'POST' && path === '/api/folgas') r = await priv(() => addOff(body));
    else if (m === 'DELETE' && path === '/api/folgas') r = await priv(() => delOff(q));
    else if (m === 'GET' && (id = path.match(/^\/api\/agendamentos\/(\d+)\/horarios$/))) r = await priv(() => reschedSlots(id[1], q));
    else if (m === 'PUT' && (id = path.match(/^\/api\/agendamentos\/(\d+)$/))) r = await priv(() => reschedule(id[1], body));
    else if (m === 'GET' && path === '/api/mensagens') r = await priv(listTemplates);
    else if (m === 'PUT' && (id = path.match(/^\/api\/mensagens\/([\w-]+)$/))) r = await priv(() => setTemplate(id[1], body));
    else bad('Rota não encontrada', 404);

    res.status(200).json(r);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ erro: e.message });
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  }
}
