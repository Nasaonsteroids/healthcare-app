const express = require('express');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const session = require('express-session');
const util = require('util');
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

const queryPromise = util.promisify(connection.query).bind(connection);

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


app.post('/register', async (req, res) => {
    const { username, password, role, firstName, lastName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const result = await queryPromise('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, role]);
        const userId = result.insertId;
        req.session.userId = userId;
        req.session.role = role;
        res.redirect('/login'); 
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).send('Error during registration');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await queryPromise('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).send('User not found');
        }
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (passwordMatch) {
            req.session.userId = user.user_id;
            req.session.role = user.role;
            const redirectPath = user.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard';
            res.redirect(redirectPath);
        } else {
            res.status(403).send('Incorrect password');
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).send('Error during login');
    }
});

app.get('/doctor/dashboard', (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.status(403).send('Access denied');
    }
    res.render('doctorDashboard', {/* data to pass to the template */  });
});

app.get('/patient/dashboard', (req, res) => {
    if (req.session.role !== 'patient') {
        return res.status(403).send('Access denied');
    }
    res.render('patientDashboard', { /* data to pass to the template */ });
});
app.get('/appointments', (req, res) => {
    if (req.session.role !== 'doctor') {
        res.status(403).send('Access Denied');
        return;
    }
    connection.query('SELECT * FROM appointments', (error, appointments) => {
        if (error) {
            console.error('Error fetching appointments:', error);
            return res.status(500).send('Error retrieving appointments');
        }
        res.render('appointments', { appointments });
    });
});


app.get('/addAppointments', (req, res) => {
    res.render('addAppointments'); 
});



app.post('/addAppointments', async (req, res) => {
    const { firstName, lastName, phoneNumber, email, dateOfBirth, insuranceInfo, appointmentDate, reason } = req.body;

    try {
        await queryPromise('START TRANSACTION');

        let user = await queryPromise('SELECT * FROM users WHERE username = ?', [email]);
        let patientId;
        
        if (user.length === 0) {
            const patientResult = await queryPromise(
                'INSERT INTO patients (first_name, last_name, date_of_birth, phone_number, email, insurance_info) VALUES (?, ?, ?, ?, ?, ?)',
                [firstName, lastName, dateOfBirth, phoneNumber, email, insuranceInfo]
            );
            patientId = patientResult.insertId;
            
            const tempPassword = await bcrypt.hash('temporary-password', 10);
            await queryPromise(
                'INSERT INTO users (username, password, role, patient_id) VALUES (?, ?, "patient", ?)',
                [email, tempPassword, patientId]
            );
        } else {
            patientId = user[0].patient_id;
        }

        let doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1');
        if (doctor.length === 0) {
            throw new Error('No unoccupied doctors available.');
        }
        let doctorId = doctor[0].doctor_id;

        await queryPromise('UPDATE doctors SET occupied = 1 WHERE doctor_id = ?', [doctorId]);

        await queryPromise(
            'INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
            [patientId, doctorId, appointmentDate, reason, firstName, lastName]
        );

        await queryPromise('COMMIT');
        // res.redirect('/appointmentConfirmation');
        res.redirect('/index');
    } catch (error) {
        await queryPromise('ROLLBACK');
        console.error('Transaction Error:', error);
        res.status(500).send('An error occurred during the appointment booking process.');
    }
});


const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
