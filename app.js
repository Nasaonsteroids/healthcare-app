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
    if (req.session.userId) {
        const redirectPath = req.session.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard';
        res.redirect(redirectPath);
    } else {
        res.redirect('/login');
    }
});

app.get('/register', (req,res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password, first_name, last_name, date_of_birth, phone_number, email, insurance_info } = req.body;
    const defaultRole = 'patient'; 

    const userCheckQuery = 'SELECT COUNT(*) AS count FROM users WHERE username = ?';
    const userCheckResult = await queryPromise(userCheckQuery, [username]);
    if (userCheckResult[0].count > 0) {
        return res.status(400).send('Username already exists');
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).send('Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await queryPromise('START TRANSACTION');

        const userInsertSql = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
        const userResult = await queryPromise(userInsertSql, [username, hashedPassword, defaultRole]);
        const userId = userResult.insertId;

        const patientInsertQuery = 'INSERT INTO patients (first_name, last_name, date_of_birth, phone_number, email, insurance_info, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const patientResult = await queryPromise(patientInsertQuery, [first_name, last_name, date_of_birth, phone_number, email, insurance_info, userId]);
        const patientId = patientResult.insertId;

        await queryPromise('COMMIT');

        req.session.userId = userId;
        req.session.role = defaultRole;
        req.session.patientId = patientId;

        res.redirect('/login');
    } catch (error) {
        await queryPromise('ROLLBACK');
        console.error('Registration Error:', error);
        res.status(500).send('Error during registration');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return console.log(err);
        }
        res.redirect('/login');
    });
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
            if (user.role === 'doctor') {
                const doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE user_id = ?', [user.user_id]);
                req.session.doctorId = doctor[0].doctor_id;
            } else if (user.role === 'patient') {
                const patient = await queryPromise('SELECT patient_id FROM patients WHERE user_id = ?', [user.user_id]);
                req.session.patientId = patient[0].patient_id;
            }
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

app.get('/doctor/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'doctor') {
        return res.redirect('/login');
    }

    const doctorId = req.session.doctorId;

    try {
        const appointmentsQuery = `
            SELECT a.appointment_id, a.appointment_date, a.reason, p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.email AS patient_email
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            WHERE a.doctor_id = ?`;
        const appointments = await queryPromise(appointmentsQuery, [doctorId]);

        res.render('doctorDashboard', { appointments: appointments });
    } catch (error) {
        console.error('Error fetching appointments for doctor:', error);
        res.render('doctorDashboard', { appointments: [] });
    }
});

app.get('/patient/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'patient') {
        return res.redirect('/login');
    }

    const patientId = req.session.patientId;

    try {
        const appointmentsQuery = `
            SELECT a.appointment_id, a.appointment_date, a.reason, d.first_name AS doctor_first_name, d.last_name AS doctor_last_name 
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.doctor_id
            WHERE a.patient_id = ?`;
        const appointments = await queryPromise(appointmentsQuery, [patientId]);

        res.render('patientDashboard', { appointments: appointments });
    } catch (error) {
        console.error('Error fetching appointments for patient:', error);
        res.render('patientDashboard', { appointments: [] });
    }
});

app.get('/patient/add-appointment', (req, res) => {
    if (!req.session.userId || req.session.role !== 'patient') {
        return res.redirect('/login');
    }

    console.log('Session Patient ID:', req.session.patientId);
    res.render('addAppointments');
});

app.post('/patient/add-appointment', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'patient' || !req.session.patientId) {
        return res.status(400).send('Patient does not exist or session is invalid.');
    }

    const { appointment_date, appointment_time, reason } = req.body;
    const patientId = req.session.patientId; 

    try {
        console.log('Starting transaction...');
        await queryPromise('START TRANSACTION');

        const doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1');
        if (doctor.length === 0) {
            await queryPromise('ROLLBACK');
            return res.status(400).send('No unoccupied doctors available.');
        }
        let doctorId = doctor[0].doctor_id;

        console.log('Inserting new appointment...');
        const appointmentDateTime = `${appointment_date} ${appointment_time}`;
        const insertQuery = 'INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason) VALUES (?, ?, ?, ?)';
        await queryPromise(insertQuery, [patientId, doctorId, appointmentDateTime, reason]);

        console.log('Updating doctor\'s occupied status...');
        await queryPromise('UPDATE doctors SET occupied = 1 WHERE doctor_id = ?', [doctorId]);

        console.log('Committing transaction...');
        await queryPromise('COMMIT');

        res.redirect('/patient/dashboard');
    } catch (error) {
        console.log('Error during transaction, rolling back...');
        await queryPromise('ROLLBACK');
        console.error('Transaction Error:', error);
        res.status(500).send('An error occurred during the appointment booking process.');
    }
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
    const { first_name, last_name, phoneNumber, email, dateOfBirth, insuranceInfo, appointmentDateTime, reason } = req.body;

    console.log('Form submission received:', req.body);

    try {
        console.log('Starting transaction...');
        await queryPromise('START TRANSACTION');

        console.log('Checking if user exists...');
        let users = await queryPromise('SELECT * FROM users WHERE username = ?', [email]);
        
        let patientId;
        if (users.length === 0) {
            console.log('User not found, creating new patient...');
            let patientResult = await queryPromise(
                'INSERT INTO patients (first_name, last_name, date_of_birth, phone_number, email, insurance_info) VALUES (?, ?, ?, ?, ?, ?)',
                [first_name, last_name, dateOfBirth, phoneNumber, email, insuranceInfo]
            );
            patientId = patientResult.insertId;
            console.log('New patient created with ID:', patientId);

            console.log('Creating temporary user account...');
            let tempPassword = await bcrypt.hash('temporary-password', 10);
            await queryPromise(
                'INSERT INTO users (username, password, role, patient_id) VALUES (?, ?, "patient", ?)',
                [email, tempPassword, patientId]
            );
            console.log('Temporary user account created.');
        } else {
            patientId = users[0].patient_id;
            console.log('User found with patient ID:', patientId);
        }

        console.log('Checking for available doctors...');
        let doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1');
        if (doctor.length === 0) {
            console.log('No unoccupied doctors available, rolling back...');
            await queryPromise('ROLLBACK');
            return res.status(400).send('No unoccupied doctors available.');
        }
        let doctorId = doctor[0].doctor_id;
        console.log('Doctor assigned with ID:', doctorId);

        console.log('Checking if appointment time is already booked...');
        let existingAppointments = await queryPromise('SELECT * FROM appointments WHERE appointment_date = ?', [appointmentDateTime]);
        if (existingAppointments.length > 0) {
            console.log('Appointment time already booked, rolling back...');
            await queryPromise('ROLLBACK');
            return res.status(400).send('This appointment time is already booked.');
        }

        console.log('Inserting new appointment...');
        let appointmentResult = await queryPromise(
            'INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
            [patientId, doctorId, appointmentDateTime, reason, first_name, last_name]
        );
        
        console.log('Appointment inserted with result:', appointmentResult);

        console.log('Updating doctor\'s occupied status...');
        await queryPromise('UPDATE doctors SET occupied = 1 WHERE doctor_id = ?', [doctorId]);
        console.log('Doctor\'s status updated.');

        console.log('Committing transaction...');
        await queryPromise('COMMIT');
        console.log('Transaction committed.');

        res.redirect('/appointments');
    } catch (error) {
        console.log('Error during transaction, rolling back...');
        await queryPromise('ROLLBACK');
        console.error('Transaction Error:', error);
        res.status(500).send('An error occurred during the appointment booking process.');
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
