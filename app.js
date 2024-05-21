const express = require('express'); // Importera Express.js för att skapa en webbserver
const mysql = require('mysql'); // Importera MySQL-modulen för att hantera databasanslutning
const bcrypt = require('bcrypt'); // Importera bcrypt för att hashning av lösenord
const session = require('express-session'); // Importera express-session för att hantera sessioner
const util = require('util'); // Importera util för att använda util.promisify
const app = express(); // Skapa en Express-applikation

app.set('view engine', 'ejs'); // Sätt 'ejs' som vy-motor
app.use(express.urlencoded({ extended: true })); // Middleware för att parsa URL-kodade data
app.use(session({
    secret: '<NS/p4}^{3XQ?OIfGJAGEJ^([7kD(sLl', // Hemlighet för att signera session cookie
    resave: false, // Återlagra inte sessionen om ingen ändring sker
    saveUninitialized: true // Spara obekräftade sessioner
}));

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'anSfjC95', // Lösenord för databasanslutning
  database: 'healthcare_management' // Namn på databasen
});

const queryPromise = util.promisify(connection.query).bind(connection); // Gör connection.query till en promise

connection.connect(error => {
    if (error) throw error; // Kasta fel om anslutning misslyckas
    console.log('Successfully connected to the database.'); // Logga lyckad anslutning
});

app.get('/', (req, res) => {
    if (req.session.userId) {
        const redirectPath = req.session.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard'; // Bestäm omdirigering baserat på roll
        res.redirect(redirectPath); // Omdirigera till rätt dashboard
    } else {
        res.redirect('/login'); // Omdirigera till login om ingen session finns
    }
});

app.get('/register', (req,res) => {
    res.render('register'); // Rendera registreringssidan
});

app.post('/register', async (req, res) => {
    const { username, password, first_name, last_name, date_of_birth, phone_number, email, insurance_info } = req.body; // Extrahera data från request body
    const defaultRole = 'patient'; // Standardroll för nya användare

    const userCheckQuery = 'SELECT COUNT(*) AS count FROM users WHERE username = ?'; // SQL-fråga för att kontrollera om användarnamn redan finns
    const userCheckResult = await queryPromise(userCheckQuery, [username]);
    if (userCheckResult[0].count > 0) {
        return res.status(400).send('Username already exists'); // Returnera fel om användarnamn redan finns
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/; // Regex för lösenordskontroll
    if (!passwordRegex.test(password)) {
        return res.status(400).send('Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character');
    }

    const hashedPassword = await bcrypt.hash(password, 10); // Hasha lösenordet

    try {
        await queryPromise('START TRANSACTION'); // Starta en transaktion

        const userInsertSql = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'; // SQL-fråga för att infoga ny användare
        const userResult = await queryPromise(userInsertSql, [username, hashedPassword, defaultRole]);
        const userId = userResult.insertId; // Hämta insatt användar-ID

        const patientInsertQuery = 'INSERT INTO patients (first_name, last_name, date_of_birth, phone_number, email, insurance_info, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'; // SQL-fråga för att infoga patientinformation
        const patientResult = await queryPromise(patientInsertQuery, [first_name, last_name, date_of_birth, phone_number, email, insurance_info, userId]);
        const patientId = patientResult.insertId; // Hämta insatt patient-ID

        await queryPromise('COMMIT'); // Bekräfta transaktionen

        req.session.userId = userId; // Sätt sessionens användar-ID
        req.session.role = defaultRole; // Sätt sessionens roll
        req.session.patientId = patientId; // Sätt sessionens patient-ID

        res.redirect('/login'); // Omdirigera till login
    } catch (error) {
        await queryPromise('ROLLBACK'); // Återkalla transaktionen vid fel
        console.error('Registration Error:', error); // Logga fel
        res.status(500).send('Error during registration'); // Skicka felmeddelande
    }
});

app.get('/login', (req, res) => {
    res.render('login'); // Rendera login-sidan
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return console.log(err); // Logga fel om det finns problem med att förstöra sessionen
        }
        res.redirect('/login'); // Omdirigera till login efter utloggning
    });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body; // Extrahera data från request body
    try {
        const users = await queryPromise('SELECT * FROM users WHERE username = ?', [username]); // Hämta användare från databasen
        if (users.length === 0) {
            return res.status(401).send('User not found'); // Returnera fel om användaren inte hittas
        }
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password); // Jämför hashat lösenord
        if (passwordMatch) {
            req.session.userId = user.user_id; // Sätt sessionens användar-ID
            req.session.role = user.role; // Sätt sessionens roll
            if (user.role === 'doctor') {
                const doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE user_id = ?', [user.user_id]);
                req.session.doctorId = doctor[0].doctor_id; // Sätt sessionens doctor-ID
            } else if (user.role === 'patient') {
                const patient = await queryPromise('SELECT patient_id FROM patients WHERE user_id = ?', [user.user_id]);
                req.session.patientId = patient[0].patient_id; // Sätt sessionens patient-ID
            }
            const redirectPath = user.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard'; // Bestäm omdirigering baserat på roll
            res.redirect(redirectPath); // Omdirigera till rätt dashboard
        } else {
            res.status(403).send('Incorrect password'); // Returnera fel om lösenordet är felaktigt
        }
    } catch (error) {
        console.error('Login Error:', error); // Logga fel
        res.status(500).send('Error during login'); // Skicka felmeddelande
    }
});

app.get('/doctor/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'doctor') {
        return res.redirect('/login'); // Omdirigera till login om session saknas eller roll inte är doktor
    }

    const doctorId = req.session.doctorId;

    try {
        const appointmentsQuery = `
            SELECT a.appointment_id, a.appointment_date, a.reason, p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.email AS patient_email
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            WHERE a.doctor_id = ?`; // SQL-fråga för att hämta läkarens möten
        const appointments = await queryPromise(appointmentsQuery, [doctorId]);

        res.render('doctorDashboard', { appointments: appointments }); // Rendera dashboard med mötesdata
    } catch (error) {
        console.error('Error fetching appointments for doctor:', error); // Logga fel
        res.render('doctorDashboard', { appointments: [] }); // Rendera tom dashboard vid fel
    }
});

app.get('/patient/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'patient') {
        return res.redirect('/login'); // Omdirigera till login om session saknas eller roll inte är patient
    }

    const patientId = req.session.patientId;

    try {
        const appointmentsQuery = `
            SELECT a.appointment_id, a.appointment_date, a.reason, d.first_name AS doctor_first_name, d.last_name AS doctor_last_name 
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.doctor_id
            WHERE a.patient_id = ?`; // SQL-fråga för att hämta patientens möten
        const appointments = await queryPromise(appointmentsQuery, [patientId]);

        res.render('patientDashboard', { appointments: appointments }); // Rendera dashboard med mötesdata
    } catch (error) {
        console.error('Error fetching appointments for patient:', error); // Logga fel
        res.render('patientDashboard', { appointments: [] }); // Rendera tom dashboard vid fel
    }
});

app.get('/patient/add-appointment', (req, res) => {
    if (!req.session.userId || req.session.role !== 'patient') {
        return res.redirect('/login'); // Omdirigera till login om session saknas eller roll inte är patient
    }

    console.log('Session Patient ID:', req.session.patientId); // Logga patientens session-ID
    res.render('addAppointments'); // Rendera sidan för att lägga till möten
});

app.post('/patient/add-appointment', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'patient' || !req.session.patientId) {
        return res.status(400).send('Patient does not exist or session is invalid.'); // Returnera fel om session är ogiltig
    }

    const { appointment_date, appointment_time, reason } = req.body; // Extrahera data från request body
    const patientId = req.session.patientId; // Hämta patientens ID från sessionen

    try {
        console.log('Starting transaction...');
        await queryPromise('START TRANSACTION'); // Starta en transaktion

        const doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1'); // Hämta en tillgänglig läkare
        if (doctor.length === 0) {
            await queryPromise('ROLLBACK');
            return res.status(400).send('No unoccupied doctors available.'); // Returnera fel om inga läkare är tillgängliga
        }
        let doctorId = doctor[0].doctor_id;

        console.log('Inserting new appointment...');
        const appointmentDateTime = `${appointment_date} ${appointment_time}`; // Kombinera datum och tid
        const insertQuery = 'INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason) VALUES (?, ?, ?, ?)'; // SQL-fråga för att infoga nytt möte
        await queryPromise(insertQuery, [patientId, doctorId, appointmentDateTime, reason]);

        console.log('Updating doctor\'s occupied status...');
        await queryPromise('UPDATE doctors SET occupied = 1 WHERE doctor_id = ?', [doctorId]); // Uppdatera läkarens status till upptagen

        console.log('Committing transaction...');
        await queryPromise('COMMIT'); // Bekräfta transaktionen

        res.redirect('/patient/dashboard'); // Omdirigera till patientens dashboard
    } catch (error) {
        console.log('Error during transaction, rolling back...');
        await queryPromise('ROLLBACK'); // Återkalla transaktionen vid fel
        console.error('Transaction Error:', error); // Logga fel
        res.status(500).send('An error occurred during the appointment booking process.'); // Skicka felmeddelande
    }
});

app.get('/appointments', (req, res) => {
    if (req.session.role !== 'doctor') {
        res.status(403).send('Access Denied'); // Returnera åtkomst nekad om inte läkare
        return;
    }
    connection.query('SELECT * FROM appointments', (error, appointments) => {
        if (error) {
            console.error('Error fetching appointments:', error); // Logga fel
            return res.status(500).send('Error retrieving appointments'); // Skicka felmeddelande
        }
        res.render('appointments', { appointments }); // Rendera sidan med mötesdata
    });
});

app.get('/addAppointments', (req, res) => {
    res.render('addAppointments'); // Rendera sidan för att lägga till möten
});

app.post('/addAppointments', async (req, res) => {
    const { first_name, last_name, phoneNumber, email, dateOfBirth, insuranceInfo, appointmentDateTime, reason } = req.body; // Extrahera data från request body

    console.log('Form submission received:', req.body); // Logga inskickad form

    try {
        console.log('Starting transaction...');
        await queryPromise('START TRANSACTION'); // Starta en transaktion

        console.log('Checking if user exists...');
        let users = await queryPromise('SELECT * FROM users WHERE username = ?', [email]); // Kontrollera om användare redan finns

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
            let tempPassword = await bcrypt.hash('temporary-password', 10); // Skapa temporärt lösenord
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
        let doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1'); // Kontrollera tillgängliga läkare
        if (doctor.length === 0) {
            console.log('No unoccupied doctors available, rolling back...');
            await queryPromise('ROLLBACK');
            return res.status(400).send('No unoccupied doctors available.'); // Returnera fel om inga läkare är tillgängliga
        }
        let doctorId = doctor[0].doctor_id;
        console.log('Doctor assigned with ID:', doctorId);

        console.log('Checking if appointment time is already booked...');
        let existingAppointments = await queryPromise('SELECT * FROM appointments WHERE appointment_date = ?', [appointmentDateTime]);
        if (existingAppointments.length > 0) {
            console.log('Appointment time already booked, rolling back...');
            await queryPromise('ROLLBACK');
            return res.status(400).send('This appointment time is already booked.'); // Returnera fel om mötestiden redan är bokad
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

        res.redirect('/appointments'); // Omdirigera till mötessidan
    } catch (error) {
        console.log('Error during transaction, rolling back...');
        await queryPromise('ROLLBACK');
        console.error('Transaction Error:', error);
        res.status(500).send('An error occurred during the appointment booking process.'); // Skicka felmeddelande
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`); // Starta servern och logga portnummer
});
