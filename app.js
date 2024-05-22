const express = require('express'); // Importera Express.js för att skapa en webbserver
const mysql = require('mysql'); // Importera MySQL-modulen för att hantera databasanslutning
const bcrypt = require('bcrypt'); // Importera bcrypt för att hashning av lösenord
const session = require('express-session'); // Importera express-session för att hantera sessioner
const util = require('util'); // Importera util för att använda util.promisify
const crypto = require('crypto'); // Importera crypto för att generera tokens
const nodemailer = require('nodemailer'); // Importera nodemailer för att skicka e-post
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

app.get('/register', (req, res) => {
    res.render('register'); // Rendera registreringssidan
});

app.post('/register', async (req, res) => {
    const { username, password, first_name, last_name, date_of_birth, phone_number, email, insurance_info } = req.body; // Extrahera data från request body
    const defaultRole = 'patient'; // Standardroll för nya användare

    const userCheckQuery = 'SELECT COUNT(*) AS count FROM users WHERE username = ?'; // SQL-fråga för att kontrollera om användarnamn redan finns
    const userCheckResult = await queryPromise(userCheckQuery, [username]);
    if (userCheckResult[0].count > 0) {
        return res.status(400).send('Användarnamn finns redan'); // Returnera fel om användarnamn redan finns
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/; // Regex för lösenordskontroll
    if (!passwordRegex.test(password)) {
        return res.status(400).send('Lösenordet måste vara minst 8 tecken långt och innehålla en versal, en gemen, ett nummer och ett specialtecken');
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
        console.error('Registreringsfel:', error); // Logga fel
        res.status(500).send('Fel under registrering'); // Skicka felmeddelande
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
            return res.status(401).send('Användaren hittades inte'); // Returnera fel om användaren inte hittas
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
            res.status(403).send('Felaktigt lösenord'); // Returnera fel om lösenordet är felaktigt
        }
    } catch (error) {
        console.error('Inloggningsfel:', error); // Logga fel
        res.status(500).send('Fel under inloggning'); // Skicka felmeddelande
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
        console.error('Fel vid hämtning av möten för läkare:', error); // Logga fel
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
        console.error('Fel vid hämtning av möten för patient:', error); // Logga fel
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
        return res.status(400).send('Patienten finns inte eller sessionen är ogiltig.'); // Returnera fel om session är ogiltig
    }

    const { appointment_date, appointment_time, reason } = req.body; // Extrahera data från request body
    const patientId = req.session.patientId; // Hämta patientens ID från sessionen

    try {
        console.log('Startar transaktion...');
        await queryPromise('START TRANSACTION'); // Starta en transaktion

        const doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1'); // Hämta en tillgänglig läkare
        if (doctor.length === 0) {
            await queryPromise('ROLLBACK');
            return res.status(400).send('Inga lediga läkare tillgängliga.'); // Returnera fel om inga läkare är tillgängliga
        }
        let doctorId = doctor[0].doctor_id;

        console.log('Infogar nytt möte...');
        const appointmentDateTime = `${appointment_date} ${appointment_time}`; // Kombinera datum och tid
        const insertQuery = 'INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason) VALUES (?, ?, ?, ?)'; // SQL-fråga för att infoga nytt möte
        await queryPromise(insertQuery, [patientId, doctorId, appointmentDateTime, reason]);

        console.log('Uppdaterar läkarens status till upptagen...');
        await queryPromise('UPDATE doctors SET occupied = 1 WHERE doctor_id = ?', [doctorId]); // Uppdatera läkarens status till upptagen

        console.log('Bekräftar transaktion...');
        await queryPromise('COMMIT'); // Bekräfta transaktionen

        res.redirect('/patient/dashboard'); // Omdirigera till patientens dashboard
    } catch (error) {
        console.log('Fel under transaktion, återkallar...');
        await queryPromise('ROLLBACK'); // Återkalla transaktionen vid fel
        console.error('Transaktionsfel:', error); // Logga fel
        res.status(500).send('Ett fel inträffade under bokningen av mötet.'); // Skicka felmeddelande
    }
});

app.get('/appointments', (req, res) => {
    if (req.session.role !== 'doctor') {
        res.status(403).send('Åtkomst nekad'); // Returnera åtkomst nekad om inte läkare
        return;
    }
    connection.query('SELECT * FROM appointments', (error, appointments) => {
        if (error) {
            console.error('Fel vid hämtning av möten:', error); // Logga fel
            return res.status(500).send('Fel vid hämtning av möten'); // Skicka felmeddelande
        }
        res.render('appointments', { appointments }); // Rendera sidan med mötesdata
    });
});

app.get('/addAppointments', (req, res) => {
    res.render('addAppointments'); // Rendera sidan för att lägga till möten
});

app.post('/addAppointments', async (req, res) => {
    const { first_name, last_name, phoneNumber, email, dateOfBirth, insuranceInfo, appointmentDateTime, reason } = req.body; // Extrahera data från request body

    console.log('Formulärsinskickning mottagen:', req.body); // Logga inskickad form

    try {
        console.log('Startar transaktion...');
        await queryPromise('START TRANSACTION'); // Starta en transaktion

        console.log('Kontrollerar om användaren finns...');
        let users = await queryPromise('SELECT * FROM users WHERE username = ?', [email]); // Kontrollera om användare redan finns

        let patientId;
        if (users.length === 0) {
            console.log('Användaren hittades inte, skapar ny patient...');
            let patientResult = await queryPromise(
                'INSERT INTO patients (first_name, last_name, date_of_birth, phone_number, email, insurance_info) VALUES (?, ?, ?, ?, ?, ?)',
                [first_name, last_name, dateOfBirth, phoneNumber, email, insuranceInfo]
            );
            patientId = patientResult.insertId;
            console.log('Ny patient skapad med ID:', patientId);

            console.log('Skapar temporärt användarkonto...');
            let tempPassword = await bcrypt.hash('temporary-password', 10); // Skapa temporärt lösenord
            await queryPromise(
                'INSERT INTO users (username, password, role, patient_id) VALUES (?, ?, "patient", ?)',
                [email, tempPassword, patientId]
            );
            console.log('Temporärt användarkonto skapat.');
        } else {
            patientId = users[0].patient_id;
            console.log('Användare hittad med patient-ID:', patientId);
        }

        console.log('Kontrollerar tillgängliga läkare...');
        let doctor = await queryPromise('SELECT doctor_id FROM doctors WHERE occupied = 0 LIMIT 1'); // Kontrollera tillgängliga läkare
        if (doctor.length === 0) {
            console.log('Inga lediga läkare tillgängliga, återkallar...');
            await queryPromise('ROLLBACK');
            return res.status(400).send('Inga lediga läkare tillgängliga.'); // Returnera fel om inga läkare är tillgängliga
        }
        let doctorId = doctor[0].doctor_id;
        console.log('Läkare tilldelad med ID:', doctorId);

        console.log('Kontrollerar om mötestid redan är bokad...');
        let existingAppointments = await queryPromise('SELECT * FROM appointments WHERE appointment_date = ?', [appointmentDateTime]);
        if (existingAppointments.length > 0) {
            console.log('Mötestid redan bokad, återkallar...');
            await queryPromise('ROLLBACK');
            return res.status(400).send('Denna mötestid är redan bokad.'); // Returnera fel om mötestiden redan är bokad
        }

        console.log('Infogar nytt möte...');
        let appointmentResult = await queryPromise(
            'INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
            [patientId, doctorId, appointmentDateTime, reason, first_name, last_name]
        );

        console.log('Möte infogat med resultat:', appointmentResult);

        console.log('Uppdaterar läkarens status till upptagen...');
        await queryPromise('UPDATE doctors SET occupied = 1 WHERE doctor_id = ?', [doctorId]);
        console.log('Läkarens status uppdaterad.');

        console.log('Bekräftar transaktion...');
        await queryPromise('COMMIT');
        console.log('Transaktion bekräftad.');

        res.redirect('/appointments'); // Omdirigera till mötessidan
    } catch (error) {
        console.log('Fel under transaktion, återkallar...');
        await queryPromise('ROLLBACK');
        console.error('Transaktionsfel:', error);
        res.status(500).send('Ett fel inträffade under bokningen av mötet.'); // Skicka felmeddelande
    }
});

// Lösenordsåterställningsfunktionalitet
app.get('/forgot-password', (req, res) => {
    res.render('forgotPassword'); // Rendera sidan för glömt lösenord
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const users = await queryPromise('SELECT * FROM users WHERE username = ?', [email]);
        if (users.length === 0) {
            return res.status(404).send('Ingen användare hittades med den e-postadressen.');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiration = Date.now() + 3600000; // Token giltig i 1 timme

        await queryPromise('UPDATE users SET reset_token = ?, reset_token_expiration = ? WHERE username = ?', [token, tokenExpiration, email]);

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: 'your-email@gmail.com',
                pass: 'your-email-password'
            }
        });

        const mailOptions = {
            to: email,
            subject: 'Återställning av lösenord',
            text: `Du har begärt en återställning av ditt lösenord. Klicka på länken för att återställa ditt lösenord: http://localhost:3000/reset-password?token=${token}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
            console.log('E-post för lösenordsåterställning skickad:', info.response);
        });

        res.send('Länk för lösenordsåterställning har skickats till din e-post.');
    } catch (error) {
        console.error('Fel vid skickning av e-post för lösenordsåterställning:', error);
        res.status(500).send('Fel vid skickning av e-post för lösenordsåterställning.');
    }
});

app.get('/reset-password', (req, res) => {
    const { token } = req.query;
    res.render('resetPassword', { token }); // Rendera sidan för återställning av lösenord
});

app.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const users = await queryPromise('SELECT * FROM users WHERE reset_token = ? AND reset_token_expiration > ?', [token, Date.now()]);
        if (users.length === 0) {
            return res.status(400).send('Ogiltig eller utgången token');
        }

        const user = users[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await queryPromise('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiration = NULL WHERE user_id = ?', [hashedPassword, user.user_id]);

        res.send('Lösenordet har återställts');
    } catch (error) {
        console.error('Fel vid återställning av lösenord:', error);
        res.status(500).send('Fel vid återställning av lösenord');
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Servern körs på port ${port}`); // Starta servern och logga portnummer
});
