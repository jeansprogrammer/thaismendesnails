-- Thaís Mendes Nails: schema para Neon (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Profissional (login do painel). Guarde SEMPRE o hash (bcrypt/argon2), nunca a senha.
CREATE TABLE admin_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serviços (a profissional edita preço; o resto é com você)
CREATE TABLE services (
  id          TEXT PRIMARY KEY,               -- ex.: 'gel'
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  minutes     INT NOT NULL CHECK (minutes > 0),
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Horários de trabalho por dia da semana (0 = domingo ... 6 = sábado).
-- Várias linhas no mesmo dia = pausa (ex.: 09-12 e 14-18). Sem linha = não trabalha.
CREATE TABLE working_hours (
  id         SERIAL PRIMARY KEY,
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX ON working_hours (weekday);

-- Folgas e bloqueios por data. start/end nulos = dia inteiro.
CREATE TABLE time_off (
  id         SERIAL PRIMARY KEY,
  day        DATE NOT NULL,
  start_time TIME,
  end_time   TIME,
  reason     TEXT,
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (end_time IS NULL OR end_time > start_time)
);
CREATE INDEX ON time_off (day);

-- Clientes
CREATE TABLE customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  whatsapp   TEXT NOT NULL UNIQUE,            -- só dígitos com DDI: 5587999999999
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agendamentos
CREATE TABLE appointments (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,         -- preço congelado no momento da reserva
  status      TEXT NOT NULL DEFAULT 'confirmed'
              CHECK (status IN ('confirmed','done','canceled','no_show')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- impede dois agendamentos ativos sobrepostos
  EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status IN ('confirmed','done'))
);
CREATE INDEX ON appointments (starts_at);

-- Serviços de cada agendamento (preço congelado)
CREATE TABLE appointment_services (
  appointment_id INT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id     TEXT NOT NULL REFERENCES services(id),
  price          NUMERIC(10,2) NOT NULL,
  minutes        INT NOT NULL,
  PRIMARY KEY (appointment_id, service_id)
);

-- ========== DADOS INICIAIS ==========
INSERT INTO services (id, name, description, price, minutes, sort_order) VALUES
('gel',   'Esmaltação em gel',         'Cor intensa e brilho que dura até 3 semanas.',    55,  60,  1),
('trad',  'Manicure tradicional',      'Cutilagem delicada e esmaltação clássica.',       30,  45,  2),
('pedi',  'Pedicure',                  'Cuidado completo para pés leves e macios.',       40,  60,  3),
('fibra', 'Alongamento em fibra',      'Formato perfeito, leve e resistente.',            180, 150, 4),
('manut', 'Manutenção do alongamento', 'Reposição e acabamento a cada 15–20 dias.',       120, 120, 5),
('bind',  'Blindagem',                 'Reforço que protege e fortalece a unha natural.', 80,  90,  6),
('art',   'Nail art',                  'Decorações, francesinha, pedrarias e mais.',      25,  30,  7),
('spa',   'Spa dos pés',               'Esfoliação, hidratação e massagem relaxante.',    70,  60,  8);

-- Seg–Sex 09–12 e 14–18 · Sáb 09–13 · Domingo fechado
INSERT INTO working_hours (weekday, start_time, end_time)
SELECT d, t.s::time, t.e::time
FROM generate_series(1,5) d, (VALUES ('09:00','12:00'),('14:00','18:00')) AS t(s,e);
INSERT INTO working_hours (weekday, start_time, end_time) VALUES (6,'09:00','13:00');

-- Login da profissional: gere o hash na API (bcrypt) e rode:
-- INSERT INTO admin_users (email, password_hash) VALUES ('email@dela.com', '$2b$10$...');
