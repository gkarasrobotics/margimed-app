const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

// ==================== PATIENTS ====================
app.get('/tables/patients', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM patients ORDER BY surname, name');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tables/patients', async (req, res) => {
  try {
    const { surname, name, mobile, email } = req.body;
    const result = await pool.query(
      `INSERT INTO patients (surname, name, mobile, email, country) VALUES ($1,$2,$3,$4,'Ελλάδα') RETURNING *`,
      [surname, name, mobile, email]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/tables/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { surname, name, mobile, email } = req.body;
    const result = await pool.query(
      `UPDATE patients SET surname=$1, name=$2, mobile=$3, email=$4 WHERE id=$5 RETURNING *`,
      [surname, name, mobile, email, id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/tables/patients/:id', async (req, res) => {
  await pool.query('DELETE FROM patients WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ==================== APPOINTMENTS ====================
app.get('/tables/appointments', async (req, res) => {
  const rows = await query('SELECT * FROM appointments ORDER BY date, time');
  res.json({ data: rows });
});

app.post('/tables/appointments', async (req, res) => {
  try {
    const { doctorId, patientId, patientName, patientPhone, date, time, status, source, notes } = req.body;
    
    // ✅ Αποτροπή διπλοκρατήσεων
    const existing = await pool.query(
      `SELECT id FROM appointments WHERE doctor_id = $1 AND date = $2 AND time = $3 AND status != 'cancelled'`,
      [doctorId, date, time]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Η ώρα είναι ήδη κλεισμένη' });
    }
    
    const result = await pool.query(
      `INSERT INTO appointments (doctor_id, patient_id, patient_name, patient_phone, date, time, status, source, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [doctorId, patientId, patientName, patientPhone, date, time, status, source, notes]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/tables/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { doctorId, patientId, patientName, patientPhone, date, time, status, source, notes } = req.body;
    
    // Έλεγχος σύγκρουσης κατά την ενημέρωση
    const existing = await pool.query(
      `SELECT id FROM appointments WHERE doctor_id = $1 AND date = $2 AND time = $3 AND id != $4 AND status != 'cancelled'`,
      [doctorId, date, time, id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Η ώρα είναι ήδη κλεισμένη' });
    }
    
    const result = await pool.query(
      `UPDATE appointments SET doctor_id=$1, patient_id=$2, patient_name=$3, patient_phone=$4, date=$5, time=$6, status=$7, source=$8, notes=$9 WHERE id=$10 RETURNING *`,
      [doctorId, patientId, patientName, patientPhone, date, time, status, source, notes, id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/tables/appointments/:id', async (req, res) => {
  await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ==================== DOCTOR SETTINGS ====================
app.get('/tables/doctor_settings', async (req, res) => {
  const rows = await query('SELECT * FROM doctor_settings');
  res.json({ data: rows });
});

app.post('/tables/doctor_settings', async (req, res) => {
  const { doctorId, doctorName, timeRanges, duration, maxPerDay, advanceDays, daysOfWeek, slotDuration } = req.body;
  const result = await pool.query(
    `INSERT INTO doctor_settings (doctor_id, doctor_name, time_ranges, duration, max_per_day, advance_days, days_of_week, slot_duration)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (doctor_id) DO UPDATE SET
       doctor_name = EXCLUDED.doctor_name,
       time_ranges = EXCLUDED.time_ranges,
       duration = EXCLUDED.duration,
       max_per_day = EXCLUDED.max_per_day,
       advance_days = EXCLUDED.advance_days,
       days_of_week = EXCLUDED.days_of_week,
       slot_duration = EXCLUDED.slot_duration
     RETURNING *`,
    [doctorId, doctorName, JSON.stringify(timeRanges), duration, maxPerDay, advanceDays, JSON.stringify(daysOfWeek || []), slotDuration || 30]
  );
  res.json(result.rows[0]);
});

app.put('/tables/doctor_settings/:id', async (req, res) => {
  const { doctorId, doctorName, timeRanges, duration, maxPerDay, advanceDays, daysOfWeek, slotDuration } = req.body;
  const result = await pool.query(
    `UPDATE doctor_settings SET doctor_id=$1, doctor_name=$2, time_ranges=$3, duration=$4, max_per_day=$5, advance_days=$6, days_of_week=$7, slot_duration=$8 WHERE id=$9 RETURNING *`,
    [doctorId, doctorName, JSON.stringify(timeRanges), duration, maxPerDay, advanceDays, JSON.stringify(daysOfWeek || []), slotDuration || 30, req.params.id]
  );
  res.json(result.rows[0]);
});

// ==================== DATABASE INIT (με νέα πεδία) ====================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      surname TEXT, name TEXT, mobile TEXT, email TEXT, country TEXT DEFAULT 'Ελλάδα',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      patient_name TEXT, patient_phone TEXT,
      date DATE, time TIME,
      status TEXT DEFAULT 'pending',
      source TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS doctor_settings (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER UNIQUE,
      doctor_name TEXT,
      time_ranges JSONB,
      duration INTEGER,
      max_per_day INTEGER,
      advance_days INTEGER,
      days_of_week JSONB DEFAULT '[]',
      slot_duration INTEGER DEFAULT 30
    );
    INSERT INTO doctor_settings (doctor_id, doctor_name, time_ranges, duration, max_per_day, advance_days, days_of_week, slot_duration)
    VALUES 
      (1, 'Παιδίατρος Μαρία Γκαρα', '[{"start":"09:00","end":"13:00"},{"start":"17:00","end":"20:00"}]', 30, 15, 30, '["Monday","Tuesday","Wednesday","Thursday","Friday"]', 30)
    ON CONFLICT (doctor_id) DO NOTHING;
    INSERT INTO doctor_settings (doctor_id, doctor_name, time_ranges, duration, max_per_day, advance_days, days_of_week, slot_duration)
    VALUES 
      (2, 'Παθολόγος Ιωάννης Γεωργατζίνος', '[{"start":"10:00","end":"14:00"},{"start":"18:00","end":"21:00"}]', 30, 15, 30, '["Monday","Tuesday","Wednesday","Thursday","Friday"]', 30)
    ON CONFLICT (doctor_id) DO NOTHING;
  `);
  console.log('Database updated with days_of_week and slot_duration');
}

initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});