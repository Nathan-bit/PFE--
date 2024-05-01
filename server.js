const session = require('express-session')
const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const ejs = require('ejs')
const routes = require('./routes/routes')
const connectionRoutes = require('./routes/connectionRoutes')
const uploadsRoutes = require('./routes/uploadsRoutes')
const databaseRoutes = require('./routes/databaseRoutes')
const UserProfilesRoutes = require('./routes/UserProfilesRoutes')
const entrepriseRoutes = require('./routes/entrepriseRoutes')
const etudiantsRoutes = require('./routes/etudiantsRoutes')
const authenticate = require('./middlewares/auth')
const { isAdmin, isUser } = require('./middlewares/roles')

const cookieParser = require('cookie-parser')
const flash = require('connect-flash')
const user_registration = require('./controllers/UserRegistration')
const stages = require('./model/stagesModel')
const {
    candidature,
    stagepostulation,
} = require('./model/stagepostulationModel')
const etudiant = require('./model/model')

/* const logger = require('./logs/logger'); */

const app = express()
app.use(cookieParser())
app.use(flash())
app.use(express.json({ limit: '50mb' })) // For JSON requests
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Serve static files from the /stockages directory
app.use('/stockages', express.static(path.join(__dirname, 'stockages')))

app.use(
    session({
        secret: process.env.secretKey,
        resave: false,
        saveUninitialized: false,
    })
)
app.use((req, res, next) => {
    res.locals.messages = req.flash()
    next()
})

// Set views directory
app.set('views', path.join(__dirname, 'views'))

// Set static directory for public files
app.use(express.static(path.join(__dirname, '')))
/* app.use((req, res, next) => {
  res.status(404).render('404');
}); */
// Parse URL-encoded bodies (as sent by HTML forms)

// Set EJS as the view engine
app.set('view engine', 'ejs')
app.set('view cache', false)

// Import routes
app.use('/people', authenticate, routes)
app.use('/connection', connectionRoutes)
app.use('/files', authenticate, isAdmin, uploadsRoutes)
// Protect /gestion and its subroutes with authenticate middleware
//app.use('/gestion', authenticate, databaseRoutes);
app.use('/gestion', authenticate, isUser, databaseRoutes)
app.use('/settings', authenticate, UserProfilesRoutes)
app.use('/entreprise', authenticate, entrepriseRoutes)
app.use('/etudiant', authenticate, etudiantsRoutes)

app.get(['/', '/home'], authenticate, (req, res) => {
    const user = req.session.user
    if (user) {
        delete user.PASSWORD
    }

    res.render('home', { user, userJSON: JSON.stringify(user) })
})

/* app.get('/check-update', async (req, res) => {
  try {
    if (req.session.user) {
      const latestUserData = await user_registration.findOne({ where: { UUID: req.session.user.UUID } });

      // Update session user data
      req.session.user = latestUserData.toJSON();
      
      // Update cookies with the latest user data
      res.cookie('user', JSON.stringify(user), { maxAge: 24 * 60 * 60 * 1000 });

      res.json(latestUserData);
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
 */

app.get('/postulate/:id', async (req, res) => {
    const id = req.params.id
    const Onestage = await stages.findByPk(id)
    if (Onestage) {
        res.render('postuler', { stage: Onestage })
    } else {
        res.render('404')
    }
})

app.get('/postulant_detail', async (req, res) => {
    const etudiantEmail = req.query.etudiantEmail // Retrieving from query parameters
    const stageId = req.query.stageId // Retrieving from query parameters
    try {
        let candidatures = await candidature.findOne({
            where: {
                email: etudiantEmail,
                id: stageId,
            },
        })
        if (!candidatures) {
            // Handle the case where no candidature is found
            return res.status(404).send('candidature not found')
        }
        const modifiedcandidature = {
            ...candidatures.toJSON(),
            cv: `/stockages/${candidatures.email}/${path.basename(
                candidatures.cv
            )}`,
            lettre_motivation: candidatures.lettre_motivation
                ? `/stockages/${candidatures.email}/${path.basename(
                      candidatures.lettre_motivation
                  )}`
                : 'document pas fournis',
            releves_notes: candidatures.releves_notes
                ? `/stockages/${candidatures.email}/${path.basename(
                      candidatures.releves_notes
                  )}`
                : 'document pas fournis',
        }

        const StageData = await stagepostulation.findOne({
            where: {
                stageId: candidatures.id,
                etudiantEmail: candidatures.email,
            },
        })
        const stageDataJSON = StageData.toJSON()
        return res.render('postulant_details', {
            candidature: modifiedcandidature,
            stage: stageDataJSON,
        })
    } catch (error) {
        // Handle errors
        console.error(error)
        return res.status(500).send('Internal Server Error')
    }
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`)
})
