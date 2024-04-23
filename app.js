const express = require('express');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: '<NS/p4}^{3XQ?OIfGJAGEJ^([7kD(sLl',
    resave: false,
    saveUninitialized: true
}));

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'anSfjC95',
  database: 'healthcare_management'
});

connection.connect(error => {
    if (error) throw error;
    console.log('Successfully connected to the database.');
  });
  
  app.get('/', (req, res) => {
    connection.query('SELECT * FROM patients', (error, results) => {
        if (error) {
            console.error('Error fetching patients:', error);
            res.status(500).send('Error retrieving patients');
        } else {
            res.render('index', { patients: results });
        }
    });
});


// Registreringsendpoint för läkare och patienter
app.post('/register', async (req, res) => {
    const { username, password, role, firstName, lastName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    let personTable = role === 'doctor' ? 'doctors' : 'patients';

    // Infoga i person tabellen (läkare eller patienter)
    connection.query(`INSERT INTO ${personTable} (first_name, last_name) VALUES (?, ?)`, [firstName, lastName], (error, results) => {
        if (error) return res.status(500).send('Fel i registreringsprocessen');
        const personId = results.insertId;

        // Infoga i användartabellen
        connection.query('INSERT INTO users (username, password, role, person_id) VALUES (?, ?, ?, ?)', [username, hashedPassword, role, personId], (error) => {
            if (error) return res.status(500).send('Fel vid skapande av användare');
            res.redirect('/login');
        });
    });
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    connection.query('SELECT * FROM users WHERE username = ?', [username], async (error, results) => {
        if (error) return res.status(500).send('Databasförfrågan misslyckades');
        if (results.length === 0) return res.status(401).send('Användaren hittades inte');
        const user = results[0];
        if (await bcrypt.compare(password, user.password)) {
            req.session.userId = user.user_id;
            req.session.role = user.role;
            req.session.personId = user.person_id;
            res.redirect(user.role === 'doctor' ? '/doctor/dashboard' : '/patients/dashboard');
        } else {
            res.status(403).send('Felaktigt lösenord');
        }
    });
});
app.get('/appointments', (req, res) => {
    if(req.session.role === 'doctor') {
      connection.query('SELECT * FROM appointments', (error, appointments) => {
        if (error) return res.status(500).send('Database query failed');
        res.render('appointments', { appointments });
      });
    } else {
      res.status(403).send('Access denied');
    }
  });
app.get('/addAppointments', (req, res) => {
    res.render('addAppointments');
});

app.get('/doctor/dashboard', (req, res) => {
    if (req.session.role !== 'doctor') return res.status(403).send('Access denied');
    connection.query('SELECT * FROM appointments', (error, appointments) => {
        if (error) throw error;
        res.render('doctorDashboard', { appointments });
    });
});

// Patients dashboard
app.get('/patients/dashboard', (req, res) => {
    if (req.session.role !== 'patient') return res.status(403).send('Access denied'); 
    connection.query('SELECT * FROM appointments WHERE patient_id = ?', [req.session.personId], (error, appointments) => {
        if (error) throw error;
        res.render('patientDashboard', { appointments }); 
    });
});


app.post('/addAppointments', (req, res) => {
    const patientId = req.session.personId;
    const { dateOfBirth, phoneNumber, email, insuranceCompany, date, time } = req.body;
  
    const query = 'INSERT INTO appointments (patient_id, date_of_birth, phone_number, email, insurance_info, date, time) VALUES (?, ?, ?, ?, ?, ?, ?)';
    connection.query(query, [patientId, dateOfBirth, phoneNumber, email, insuranceCompany, date, time], (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).send('Error in booking appointment');
      }
      
      if(req.session.role === 'doctor') {
        res.redirect('/doctor/dashboard');
      } else {
        res.redirect('/patient/dashboard');
      }
    });
  });
  
const port = 3000;
app.listen(port, () => {
    console.log(`Server körs på port ${port}`);
});
