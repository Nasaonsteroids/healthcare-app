const express = require('express');
const mysql = require('mysql');
const app = express();
const port = 3000;

// Ställ in vy-motorn
app.set('view engine', 'ejs');

// Middleware för att tolka application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Inställningar för MySQL-anslutning
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'anSfjC95',
  database: 'healthcare_management'
});

// Verifiera anslutningen
connection.connect(error => {
  if (error) throw error;
  console.log('Successfully connected to the database.');
});

// Rot-route
app.get('/', (req, res) => {
  connection.query('SELECT * FROM Patients', (error, results) => {
    if (error) throw error;
    res.render('index', { patients: results });
  });
});

// Sida för möten
app.get('/appointments', (req, res) => {
  connection.query('SELECT * FROM Appointments', (error, results) => {
    if (error) throw error;
    res.render('appointments', { appointments: results });
  });
});

// Hanterare för att visa formuläret för att lägga till möten
app.get('/addAppointments', (req, res) => {
  res.render('addAppointments');
});

// Hanterare för att lägga till möten
app.post('/appointments', (req, res) => {
  const { first_name, last_name, appointment_date, reason } = req.body;
  // Sök eller skapa patient
  connection.query('SELECT patient_id FROM Patients WHERE first_name = ? AND last_name = ?', [first_name, last_name], (error, results) => {
    if (error) throw error;
    let patient_id = results.length ? results[0].patient_id : null;
    if (!patient_id) {
      // Infoga ny patient och använd det nya ID:t
      connection.query('INSERT INTO Patients (first_name, last_name) VALUES (?, ?)', [first_name, last_name], (error, results) => {
        if (error) throw error;
        patient_id = results.insertId;
        assignDoctor();
      });
    } else {
      assignDoctor();
    }

    function assignDoctor() {
      // Välj slumpmässigt en ockuperad läkare
      connection.query('SELECT doctor_id FROM Doctors WHERE occupied = 0 LIMIT 1', (error, results) => {
        if (error) throw error;
        if (results.length) {
          const doctor_id = results[0].doctor_id;
          // Uppdatera läkarens status till ockuperad
          connection.query('UPDATE Doctors SET occupied = 1 WHERE doctor_id = ?', [doctor_id], (error) => {
            if (error) throw error;
            // Infoga möte
            const sql = 'INSERT INTO Appointments (patient_id, appointment_date, doctor_id, reason) VALUES (?, ?, ?, ?)';
            connection.query(sql, [patient_id, appointment_date, doctor_id, reason], (error) => {
              if (error) throw error;
              res.redirect('/');  // Omdirigera till startsidan
            });
          });
        } else {
          res.status(500).send('No available doctors.');
        }
      });
    }
  });
});

// Starta servern
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
