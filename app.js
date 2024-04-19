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

// Registration endpoint for doctors and patients
app.post('/register', async (req, res) => {
    const { username, password, role, firstName, lastName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    let personTable = role === 'doctor' ? 'doctors' : 'patients';
    let personIdField = role === 'doctor' ? 'doctor_id' : 'patient_id';

    // Insert into person table (doctors or patients)
    connection.query(`INSERT INTO ${personTable} (first_name, last_name) VALUES (?, ?)`, [firstName, lastName], (error, results) => {
        if (error) return res.status(500).send('Error in registration process');
        const personId = results.insertId;

        // Insert into users table
        connection.query('INSERT INTO users (username, password, role, person_id) VALUES (?, ?, ?, ?)', [username, hashedPassword, role, personId], (error) => {
            if (error) return res.status(500).send('Error in user creation process');
            res.redirect('/login');
        });
    });
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    connection.query('SELECT * FROM users WHERE username = ?', [username], async (error, results) => {
        if (error) return res.status(500).send('Database query failed');
        if (results.length === 0) return res.status(401).send('User not found');
        const user = results[0];
        if (await bcrypt.compare(password, user.password)) {
            req.session.userId = user.user_id;
            req.session.role = user.role;
            req.session.personId = user.person_id;
            res.redirect(user.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard');
        } else {
            res.status(403).send('Incorrect password');
        }
    });
});

// Doctor's dashboard
app.get('/doctor/dashboard', (req, res) => {
    if (req.session.role !== 'doctor') return res.status(403).send('Access denied');
    connection.query('SELECT * FROM appointments WHERE doctor_id = ?', [req.session.personId], (error, appointments) => {
        if (error) throw error;
        res.render('doctorDashboard', { appointments });
    });
});

// Patient's dashboard
app.get('/patient/dashboard', (req, res) => {
    if (req.session.role !== 'patient') return res.status(403).send('Access denied');
    connection.query('SELECT * FROM appointments WHERE patient_id = ?', [req.session.personId], (error, appointments) => {
        if (error) throw error;
        res.render('patientDashboard', { appointments });
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
