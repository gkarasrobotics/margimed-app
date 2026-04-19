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

function snakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Patients
app.get('/tables/patients', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM patients ORDER BY surname, name');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tables/patients', async (req, res) => {
  try {
    const { surname, name, fatherName, gender, birthDate, marital, profession,
            idNumber, amka, afm, mobile, landline, workPhone, email, address,
            city, zip, country, insurer, insNumber, bloodType, chronicDiseases,
            allergies, medication, notes, emergencyContact, emergencyPhone, referral } = req.body;
    const result = await pool.query(
      `INSERT INTO patients (surname, name, father_name, gender, birth_date, marital, profession,
        id_number, amka, afm, mobile, landline, work_phone, email, address, city, zip, country,
        insurer, ins_number, blood_type, chronic_diseases, allergies, medication, notes,
        emergency_contact, emergency_phone, referral)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [surname, name, fatherName, gender, birthDate, marital, profession, idNumber, amka, afm,
       mobile, landline, workPhone, email, address, city, zip, country, insurer, insNumber,
       bloodType, chronicDiseases, allergies, medication, notes, emergencyContact, emergencyPhone, referral]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/tables/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClause = Object.keys(fields).map((k, i) => `${snakeCase(k)} = $${i+1}`).join(',');
    const values = Object.values(fields);
    values.push(id);
    const result = await pool.query(`UPDATE patients SET ${setClause} WHERE id = $${values.length} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/tables/patients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM patients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Appointments
app.get('/tables/appointments', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM appointments ORDER BY date, time');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tables/appointments', async (req, res) => {
  try {
    const { doctorId, patientId, patientName, patientPhone, date, time, status, source, notes } = req.body;
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
    const result = await pool.query(
      `UPDATE appointments SET doctor_id=$1, patient_id=$2, patient_name=$3, patient_phone=$4,
        date=$5, time=$6, status=$7, source=$8, notes=$9 WHERE id=$10 RETURNING *`,
      [doctorId, patientId, patientName, patientPhone, date, time, status, source, notes, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/tables/appointments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Doctor settings
app.get('/tables/doctor_settings', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM doctor_settings');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tables/doctor_settings', async (req, res) => {
  try {
    const { doctorId, doctorName, timeRanges, duration, maxPerDay, advanceDays } = req.body;
    const result = await pool.query(
      `INSERT INTO doctor_settings (doctor_id, doctor_name, time_ranges, duration, max_per_day, advance_days)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (doctor_id) DO UPDATE SET
         doctor_name = EXCLUDED.doctor_name,
         time_ranges = EXCLUDED.time_ranges,
         duration = EXCLUDED.duration,
         max_per_day = EXCLUDED.max_per_day,
         advance_days = EXCLUDED.advance_days
       RETURNING *`,
      [doctorId, doctorName, JSON.stringify(timeRanges), duration, maxPerDay, advanceDays]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/tables/doctor_settings/:id', async (req, res) => {
  try {
    const { doctorId, doctorName, timeRanges, duration, maxPerDay, advanceDays } = req.body;
    const result = await pool.query(
      `UPDATE doctor_settings SET doctor_id=$1, doctor_name=$2, time_ranges=$3, duration=$4, max_per_day=$5, advance_days=$6
       WHERE id=$7 RETURNING *`,
      [doctorId, doctorName, JSON.stringify(timeRanges), duration, maxPerDay, advanceDays, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Setting not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database initialization
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      surname TEXT, name TEXT, father_name TEXT, gender TEXT, birth_date DATE,
      marital TEXT, profession TEXT, id_number TEXT, amka TEXT, afm TEXT,
      mobile TEXT, landline TEXT, work_phone TEXT, email TEXT, address TEXT,
      city TEXT, zip TEXT, country TEXT DEFAULT 'Ελλάδα',
      insurer TEXT, ins_number TEXT, blood_type TEXT,
      chronic_diseases TEXT, allergies TEXT, medication TEXT, notes TEXT,
      emergency_contact TEXT, emergency_phone TEXT, referral TEXT,
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
      advance_days INTEGER
    );
    INSERT INTO doctor_settings (doctor_id, doctor_name, time_ranges, duration, max_per_day, advance_days)
    VALUES (1, 'Παιδίατρος Μαρία Γκαρα', '[{"start":"09:00","end":"13:00"},{"start":"17:00","end":"20:00"}]', 30, 15, 30)
    ON CONFLICT (doctor_id) DO NOTHING;
    INSERT INTO doctor_settings (doctor_id, doctor_name, time_ranges, duration, max_per_day, advance_days)
    VALUES (2, 'Παθολόγος Ιωάννης Γεωργατζίνος', '[{"start":"10:00","end":"14:00"},{"start":"18:00","end":"21:00"}]', 30, 15, 30)
    ON CONFLICT (doctor_id) DO NOTHING;
  `);
  console.log('Database initialized with correct doctor names');
}

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});